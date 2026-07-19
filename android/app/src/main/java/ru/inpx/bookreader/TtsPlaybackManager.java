package ru.inpx.bookreader;

import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import java.util.Locale;
import java.util.Set;

public final class TtsPlaybackManager implements TextToSpeech.OnInitListener {

    public interface UtteranceCallback {
        void onEvent(String type, String utteranceId);
    }

    private static TtsPlaybackManager instance;

    private final Context appContext;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextToSpeech tts;
    private boolean ready = false;
    private boolean sessionActive = false;
    private boolean pauseRequested = false;
    private boolean speaking = false;
    private boolean paused = false;
    private float rate = 1f;
    private String voiceName = "";
    private String lastSpokenText = "";
    private String lastUtteranceId = "";
    private Runnable pendingStopService;
    private UtteranceCallback utteranceCallback;

    private TtsPlaybackManager(Context context) {
        appContext = context.getApplicationContext();
        tts = new TextToSpeech(appContext, this);
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

    @Override
    public void onInit(int status) {
        ready = status == TextToSpeech.SUCCESS;
        if (!ready || tts == null) return;

        tts.setLanguage(new Locale("ru", "RU"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
            tts.setAudioAttributes(attrs);
        }

        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {
                speaking = true;
                paused = false;
                emitEvent("ttsStart", utteranceId);
            }

            @Override
            public void onDone(String utteranceId) {
                if (pauseRequested) {
                    pauseRequested = false;
                    speaking = false;
                    paused = true;
                    return;
                }
                speaking = false;
                paused = false;
                emitEvent("ttsEnd", utteranceId);
                scheduleStopService();
            }

            @Override
            public void onError(String utteranceId) {
                if (pauseRequested) {
                    pauseRequested = false;
                    speaking = false;
                    paused = true;
                    return;
                }
                speaking = false;
                paused = false;
                emitEvent("ttsError", utteranceId);
                scheduleStopService();
            }
        });
    }

    public void speak(String text, String utteranceId, float speechRate, String voice) {
        if (text == null || text.trim().isEmpty()) return;
        cancelPendingStopService();
        startForegroundService();
        sessionActive = true;

        if (speechRate > 0) {
            rate = Math.max(0.5f, Math.min(2f, speechRate));
        }
        if (voice != null) {
            voiceName = voice;
        }

        lastSpokenText = text;
        lastUtteranceId = utteranceId != null ? utteranceId : ("u" + System.currentTimeMillis());
        pauseRequested = false;
        paused = false;

        handler.post(() -> {
            if (!ready || tts == null) return;
            applyVoice();
            tts.setSpeechRate(rate);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, lastUtteranceId);
            } else {
                tts.speak(text, TextToSpeech.QUEUE_ADD, null);
            }
        });
    }

    public void stop() {
        sessionActive = false;
        pauseRequested = false;
        paused = false;
        speaking = false;
        lastSpokenText = "";
        lastUtteranceId = "";
        handler.post(() -> {
            if (tts != null) {
                tts.stop();
            }
            stopForegroundService();
        });
    }

    public void pause() {
        if (!speaking || tts == null) return;
        pauseRequested = true;
        handler.post(() -> {
            if (tts != null) {
                tts.stop();
            }
            speaking = false;
            paused = true;
        });
    }

    public void resume() {
        if (!paused || lastSpokenText == null || lastSpokenText.isEmpty()) return;
        speak(lastSpokenText, lastUtteranceId, rate, voiceName);
    }

    public void shutdown() {
        stop();
        handler.post(() -> {
            if (tts != null) {
                tts.shutdown();
                tts = null;
            }
            ready = false;
        });
    }

    private void applyVoice() {
        if (tts == null || voiceName == null || voiceName.isEmpty()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Set<Voice> set = tts.getVoices();
            if (set == null) return;
            for (Voice voice : set) {
                if (voiceName.equals(voice.getName())) {
                    tts.setVoice(voice);
                    return;
                }
            }
        }
    }

    private void emitEvent(String type, String utteranceId) {
        if (utteranceCallback == null) return;
        utteranceCallback.onEvent(type, utteranceId);
    }

    private void startForegroundService() {
        Intent intent = new Intent(appContext, TtsForegroundService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            appContext.startForegroundService(intent);
        } else {
            appContext.startService(intent);
        }
    }

    private void stopForegroundService() {
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
