package ru.inpx.bookreader;

import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.Set;

/**
 * TTS всегда следует системному движку из настроек телефона
 * (Специальные возможности → Синтез речи). При смене движка
 * экземпляр пересоздаётся, чтобы список голосов и озвучка
 * брались только из выбранного в системе TTS.
 */
public final class TtsPlaybackManager implements TextToSpeech.OnInitListener {

    public interface UtteranceCallback {
        /** `start` / `end` — word range in the utterance text for "ttsRange", -1 otherwise. */
        void onEvent(String type, String utteranceId, int start, int end);
    }

    private static TtsPlaybackManager instance;

    private final Context appContext;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextToSpeech tts;
    private boolean ready = false;
    private volatile boolean sessionActive = false;
    private volatile boolean speaking = false;
    /** Пауза: tts.stop() сбрасывает очередь движка, события остановки игнорируются, resume() проигрывает `pending` заново. */
    private volatile boolean paused = false;
    private float rate = 1f;
    private float pitch = 1f;
    /** Громкость фразы 0..1: таймер сна плавно приглушает голос в последнюю минуту. */
    private float volume = 1f;
    private String voiceName = "";
    private String language = "";
    /** Голос и язык, уже выставленные движку: setVoice / setLanguage перед каждой фразой давали паузу между фразами. */
    private String appliedVoiceKey = "";

    private static final class Pending {
        final String text;
        final float volume;

        Pending(String text, float volume) {
            this.text = text;
            this.volume = volume;
        }
    }

    /**
     * Фразы, отданные движку и ещё не закончившиеся, по порядку: читалка ставит следующую фразу
     * в очередь (QUEUE_ADD), пока звучит текущая, — движок готовит её заранее и начинает без паузы.
     */
    private final LinkedHashMap<String, Pending> pending = new LinkedHashMap<>();
    private String boundEngine = "";
    private Runnable pendingStopService;
    private UtteranceCallback utteranceCallback;
    private final List<Runnable> readyWaiters = new ArrayList<>();
    private int initGeneration = 0;

    private TtsPlaybackManager(Context context) {
        appContext = context.getApplicationContext();
        TtsMediaState.attach(appContext);
        recreateWithSystemDefault();
    }

    public static synchronized TtsPlaybackManager getInstance(Context context) {
        if (instance == null) {
            instance = new TtsPlaybackManager(context);
        }
        return instance;
    }

    public void setUtteranceCallback(UtteranceCallback callback) {
        utteranceCallback = callback;
    }

    public boolean isSessionActive() {
        return sessionActive;
    }

    public boolean isSpeaking() {
        return speaking;
    }

    public boolean isPaused() {
        return paused;
    }

    /**
     * Подтянуть системный TTS (если пользователь сменил движок в настройках)
     * и вызвать callback на main thread, когда инстанс готов.
     */
    public void ensureSystemDefault(Runnable onReady) {
        handler.post(() -> {
            String preferred = resolvePreferredEngine();
            // getCurrentEngine() — не в публичном SDK; сравниваем с boundEngine,
            // который задаём при создании TextToSpeech(..., engine).
            boolean matches = preferred.isEmpty()
                ? tts != null
                : preferred.equals(boundEngine);

            // Уже на нужном движке (или init ещё идёт) — ждём ready, не пересоздаём.
            if (matches && tts != null) {
                if (ready) {
                    if (onReady != null) onReady.run();
                } else if (onReady != null) {
                    readyWaiters.add(onReady);
                }
                return;
            }

            // Во время речи не рвём сессию — отдаём текущий инстанс.
            if (speaking || paused) {
                if (ready && onReady != null) onReady.run();
                else if (onReady != null) readyWaiters.add(onReady);
                return;
            }

            if (onReady != null) {
                readyWaiters.add(onReady);
            }
            recreateWithSystemDefault();
        });
    }

    @Override
    public void onInit(int status) {
        final int gen = initGeneration;
        handler.post(() -> {
            if (gen != initGeneration) return;
            ready = status == TextToSpeech.SUCCESS;
            if (ready && tts != null) {
                if (boundEngine.isEmpty()) {
                    boundEngine = resolvePreferredEngine();
                }

                try {
                    tts.setLanguage(new Locale("ru", "RU"));
                } catch (Exception ignored) { /* */ }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    try {
                        AudioAttributes attrs = new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build();
                        tts.setAudioAttributes(attrs);
                    } catch (Exception ignored) { /* */ }
                }

                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utteranceId) {
                        handler.post(() -> {
                            if (paused) return;
                            speaking = true;
                            emitEvent("ttsStart", utteranceId);
                        });
                    }

                    @Override
                    public void onDone(String utteranceId) {
                        handler.post(() -> finishUtterance(utteranceId, "ttsEnd"));
                    }

                    /** Android 8+: слово, которое движок начинает произносить (подсветка слова в читалке). */
                    @Override
                    public void onRangeStart(String utteranceId, int start, int end, int frame) {
                        handler.post(() -> {
                            if (paused) return;
                            emitEvent("ttsRange", utteranceId, start, end);
                        });
                    }

                    @Override
                    public void onError(String utteranceId) {
                        handler.post(() -> finishUtterance(utteranceId, "ttsError"));
                    }

                    @Override
                    public void onStop(String utteranceId, boolean interrupted) {
                        handler.post(() -> finishUtterance(utteranceId, interrupted ? "ttsEnd" : null));
                    }
                });
            }

            List<Runnable> waiters = new ArrayList<>(readyWaiters);
            readyWaiters.clear();
            for (Runnable waiter : waiters) {
                try {
                    waiter.run();
                } catch (Exception ignored) { /* */ }
            }
        });
    }

    /** Остановка во время паузы — наш же tts.stop(): очередь сохранена в `pending`. */
    private void finishUtterance(String utteranceId, String event) {
        if (paused) return;
        boolean empty;
        synchronized (pending) {
            pending.remove(utteranceId);
            empty = pending.isEmpty();
        }
        speaking = !empty;
        if (event != null) emitEvent(event, utteranceId);
        if (empty) scheduleStopService();
    }

    /** @param queueAdd true — после уже отданных фраз (QUEUE_ADD), false — вместо них (QUEUE_FLUSH) */
    public void speak(String text, String utteranceId, float speechRate, float speechPitch, String voice, String lang, float speechVolume, boolean queueAdd) {
        if (text == null || text.trim().isEmpty()) return;
        cancelPendingStopService();
        startForegroundService();
        sessionActive = true;

        if (speechRate > 0) {
            rate = Math.max(0.5f, Math.min(3f, speechRate));
        }
        if (speechPitch > 0) {
            pitch = Math.max(0.5f, Math.min(2f, speechPitch));
        }
        final float itemVolume = speechVolume >= 0 ? Math.max(0f, Math.min(1f, speechVolume)) : volume;
        volume = itemVolume;
        if (voice != null) {
            voiceName = voice;
        }
        if (lang != null) {
            language = lang;
        }

        final String id = utteranceId != null ? utteranceId : ("u" + System.currentTimeMillis());
        synchronized (pending) {
            if (!queueAdd) pending.clear();
            pending.put(id, new Pending(text, itemVolume));
        }
        paused = false;

        ensureSystemDefault(() -> {
            if (!ready || tts == null) return;
            applyVoice();
            tts.setSpeechRate(rate);
            tts.setPitch(pitch);
            speakNow(text, id, itemVolume, queueAdd);
        });
    }

    private void speakNow(String text, String id, float itemVolume, boolean queueAdd) {
        int mode = queueAdd ? TextToSpeech.QUEUE_ADD : TextToSpeech.QUEUE_FLUSH;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Bundle params = new Bundle();
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, itemVolume);
            tts.speak(text, mode, params, id);
        } else {
            tts.speak(text, mode, null);
        }
    }

    public void stop() {
        sessionActive = false;
        paused = false;
        speaking = false;
        synchronized (pending) {
            pending.clear();
        }
        handler.post(() -> {
            if (tts != null) {
                tts.stop();
            }
            stopForegroundService();
        });
    }

    public void pause() {
        if (tts == null || paused) return;
        synchronized (pending) {
            if (pending.isEmpty()) return;
        }
        paused = true;
        speaking = false;
        handler.post(() -> {
            if (tts != null) {
                tts.stop();
            }
        });
    }

    /** Проиграть очередь заново с прерванной фразы: она — первая в `pending`. */
    public void resume() {
        if (!paused) return;
        final List<Map.Entry<String, Pending>> items;
        synchronized (pending) {
            if (pending.isEmpty()) return;
            items = new ArrayList<>(pending.entrySet());
        }
        paused = false;
        cancelPendingStopService();
        startForegroundService();
        sessionActive = true;
        ensureSystemDefault(() -> {
            if (!ready || tts == null || paused) return;
            applyVoice();
            tts.setSpeechRate(rate);
            tts.setPitch(pitch);
            boolean first = true;
            for (Map.Entry<String, Pending> e : items) {
                speakNow(e.getValue().text, e.getKey(), e.getValue().volume, !first);
                first = false;
            }
        });
    }

    public void shutdown() {
        stop();
        handler.post(() -> {
            if (tts != null) {
                tts.shutdown();
                tts = null;
            }
            ready = false;
            boundEngine = "";
        });
    }

    /** Голоса текущего системного движка (после ensure). */
    public List<Voice> listVoices() {
        List<Voice> out = new ArrayList<>();
        if (!ready || tts == null) return out;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return out;
        Set<Voice> set;
        try {
            set = tts.getVoices();
        } catch (Exception e) {
            return out;
        }
        if (set == null) return out;

        String engine = boundEngine;

        for (Voice voice : set) {
            if (voice == null) continue;
            // На части прошивок getVoices() подмешивает чужие голоса —
            // оставляем только явно «свои» или без package в имени.
            if (!engine.isEmpty() && !voiceBelongsToEngine(voice, engine)) {
                continue;
            }
            out.add(voice);
        }

        // Если у движка имена без package — фильтр мог опустошить список.
        if (out.isEmpty()) {
            out.addAll(set);
        }
        return out;
    }

    public String getBoundEngine() {
        return boundEngine != null ? boundEngine : "";
    }

    private void recreateWithSystemDefault() {
        initGeneration++;
        if (tts != null) {
            try {
                tts.stop();
            } catch (Exception ignored) { /* */ }
            try {
                tts.shutdown();
            } catch (Exception ignored) { /* */ }
            tts = null;
        }
        ready = false;
        appliedVoiceKey = "";
        String preferred = resolvePreferredEngine();
        boundEngine = preferred;
        if (!preferred.isEmpty()) {
            tts = new TextToSpeech(appContext, this, preferred);
        } else {
            tts = new TextToSpeech(appContext, this);
        }
    }

    private String resolvePreferredEngine() {
        try {
            String fromSettings = Settings.Secure.getString(
                appContext.getContentResolver(),
                Settings.Secure.TTS_DEFAULT_SYNTH
            );
            if (fromSettings != null && !fromSettings.trim().isEmpty()) {
                return fromSettings.trim();
            }
        } catch (Exception ignored) { /* */ }

        if (tts != null) {
            try {
                String def = tts.getDefaultEngine();
                if (def != null && !def.trim().isEmpty()) {
                    return def.trim();
                }
            } catch (Exception ignored) { /* */ }
        }
        return "";
    }

    private static boolean voiceBelongsToEngine(Voice voice, String engine) {
        if (voice == null || engine == null || engine.isEmpty()) return true;
        String name = voice.getName();
        if (name == null || name.isEmpty()) return true;
        // Типичные имена: com.google.android.tts-ru-RU-... / package#locale
        if (name.startsWith(engine)) return true;
        if (name.contains(engine)) return true;
        // Голоса без package в имени считаем своими для привязанного инстанса.
        return !name.contains(".") || !name.matches("^[a-zA-Z0-9_.]+[./-].*");
    }

    /**
     * Выбранный в читалке голос; без него («Авто») — язык книги, тогда движок берёт свой голос
     * по умолчанию для этого языка (раньше всегда оставался ru-RU или последний выбранный голос).
     */
    private void applyVoice() {
        if (tts == null) return;
        String key = (voiceName != null ? voiceName : "") + "|" + (language != null ? language : "");
        if (key.equals(appliedVoiceKey)) return;
        appliedVoiceKey = key;
        if (voiceName != null && !voiceName.isEmpty() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            List<Voice> voices = listVoices();
            for (Voice voice : voices) {
                if (voiceName.equals(voice.getName())) {
                    tts.setVoice(voice);
                    return;
                }
            }
        }
        Locale locale = null;
        if (language != null && !language.trim().isEmpty() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            try {
                locale = Locale.forLanguageTag(language.trim().replace('_', '-'));
            } catch (Exception ignored) { /* */ }
        }
        if (locale == null || locale.getLanguage().isEmpty()) locale = new Locale("ru", "RU");
        try {
            int res = tts.setLanguage(locale);
            if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts.setLanguage(new Locale(locale.getLanguage()));
            }
        } catch (Exception ignored) { /* */ }
    }

    private void emitEvent(String type, String utteranceId) {
        emitEvent(type, utteranceId, -1, -1);
    }

    private void emitEvent(String type, String utteranceId, int start, int end) {
        if (utteranceCallback == null) return;
        utteranceCallback.onEvent(type, utteranceId, start, end);
    }

    private void startForegroundService() {
        Intent intent = new Intent(appContext, TtsForegroundService.class);
        intent.setAction(TtsForegroundService.ACTION_REFRESH);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            appContext.startForegroundService(intent);
        } else {
            appContext.startService(intent);
        }
    }

    private void stopForegroundService() {
        TtsMediaState.update("", "", false, false);
        Intent intent = new Intent(appContext, TtsForegroundService.class);
        appContext.stopService(intent);
    }

    private void cancelPendingStopService() {
        if (pendingStopService != null) {
            handler.removeCallbacks(pendingStopService);
            pendingStopService = null;
        }
    }

    private void scheduleStopService() {
        cancelPendingStopService();
        if (sessionActive) {
            return;
        }
        pendingStopService = () -> {
            if (!speaking && !sessionActive) {
                stopForegroundService();
            }
        };
        handler.postDelayed(pendingStopService, 120_000L);
    }

    public TextToSpeech getTts() {
        return tts;
    }

    public boolean isReady() {
        return ready;
    }
}
