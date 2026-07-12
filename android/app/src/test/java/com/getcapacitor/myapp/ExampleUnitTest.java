package com.getcapacitor.myapp;

import static org.junit.Assert.*;

import org.junit.Test;
import ru.inpx.bookreader.SplashThemeResolver;

/**
 * Unit tests for Android-native helpers used at cold start.
 */
public class ExampleUnitTest {

    @Test
    public void splashBackgroundColor_matchesAppThemeTokens() {
        assertEquals(0xFF1E1A16, SplashThemeResolver.splashBackgroundColor(true));
        assertEquals(0xFFF5F1E8, SplashThemeResolver.splashBackgroundColor(false));
    }
}
