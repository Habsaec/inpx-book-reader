package ru.inpx.bookreader;

import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

@CapacitorPlugin(name = "SecureCredentials")
public class SecureCredentialsPlugin extends Plugin {
    private static final String KEY_ALIAS = "inpx_reader_server_credentials";
    private static final String PREFS_NAME = "inpx_reader_secure_credentials";
    private static final String PREF_CIPHERTEXT = "ciphertext";
    private static final String PREF_IV = "iv";

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS_NAME, 0);
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }

    @PluginMethod
    public void save(PluginCall call) {
        try {
            String username = call.getString("username", "");
            String password = call.getString("password", "");
            String deviceToken = call.getString("deviceToken", "");
            String deviceTokenId = call.getString("deviceTokenId", "");
            JSONObject payload = new JSONObject();
            payload.put("username", username);
            payload.put("password", password);
            payload.put("deviceToken", deviceToken);
            payload.put("deviceTokenId", deviceTokenId);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] ciphertext = cipher.doFinal(payload.toString().getBytes(StandardCharsets.UTF_8));
            byte[] iv = cipher.getIV();

            boolean saved = preferences().edit()
                .putString(PREF_CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .putString(PREF_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
                .commit();
            if (!saved) {
                call.reject("Secure credential storage is unavailable");
                return;
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to protect server credentials", error);
        }
    }

    @PluginMethod
    public void load(PluginCall call) {
        SharedPreferences prefs = preferences();
        String encodedCiphertext = prefs.getString(PREF_CIPHERTEXT, null);
        String encodedIv = prefs.getString(PREF_IV, null);
        JSObject result = new JSObject();
        if (encodedCiphertext == null || encodedIv == null) {
            result.put("found", false);
            result.put("username", "");
            result.put("password", "");
            result.put("deviceToken", "");
            result.put("deviceTokenId", "");
            call.resolve(result);
            return;
        }

        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            byte[] iv = Base64.decode(encodedIv, Base64.NO_WRAP);
            byte[] ciphertext = Base64.decode(encodedCiphertext, Base64.NO_WRAP);
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
            String plaintext = new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
            JSONObject payload = new JSONObject(plaintext);
            result.put("found", true);
            result.put("username", payload.optString("username", ""));
            result.put("password", payload.optString("password", ""));
            result.put("deviceToken", payload.optString("deviceToken", ""));
            result.put("deviceTokenId", payload.optString("deviceTokenId", ""));
            call.resolve(result);
        } catch (Exception error) {
            prefs.edit().clear().commit();
            call.reject("Unable to unlock server credentials", error);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        if (preferences().edit().clear().commit()) {
            call.resolve();
        } else {
            call.reject("Unable to clear server credentials");
        }
    }
}
