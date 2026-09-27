import { Haptics, ImpactStyle } from '@capacitor/haptics';

/** Light tap on a commit: sheet snap, segment, switch. */
export function impactLight(): void {
  void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}
