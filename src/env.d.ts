/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Internal builds only: 'expanded-proposed' (r001), 'expanded-trial' (r002,
   * rewards A1/A5) or 'expanded-full' (r003, all ten rewards) selects a prototype
   * bundle. Anything else (including unset) is the official rules-v1 bundle.
   * Never read from URL parameters or storage.
   */
  readonly VITE_SHATEKKI_BUNDLE?: string;
}

interface Window {
  /** Only the separate, opt-in device measurement build emits these counters. */
  shatekkiMeasureFrame?: (time: number, sample: {
    run: string; shot: number; corks: number; prizes: number; cells: number;
  } | null) => void;
  shatekkiMeasureSettlement?: (time: number, run: string, shot: number, collected: number, ended: boolean) => void;
}
