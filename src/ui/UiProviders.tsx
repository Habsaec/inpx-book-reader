import React from 'react';
import { DialogProvider } from './Dialog';
import { SnackbarProvider } from './Snackbar';

export function UiProviders({ children }: { children: React.ReactNode }) {
  return (
    <DialogProvider>
      <SnackbarProvider>{children}</SnackbarProvider>
    </DialogProvider>
  );
}
