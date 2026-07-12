import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.tsx';
import { UiProviders } from './ui/UiProviders';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="always">
      <UiProviders>
        <App />
      </UiProviders>
    </MotionConfig>
  </StrictMode>,
);
