import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.tsx';
import { UiProviders } from './ui/UiProviders';
import AppErrorBoundary from './ui/AppErrorBoundary';
import './index.css';
import { installStablePress } from './lib/stablePress';

installStablePress();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <AppErrorBoundary>
        <UiProviders>
          <App />
        </UiProviders>
      </AppErrorBoundary>
    </MotionConfig>
  </StrictMode>,
);
