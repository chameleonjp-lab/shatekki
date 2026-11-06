/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Internal builds only: 'expanded-proposed' selects the D34-D37 prototype
   * bundle. Anything else (including unset) is the official rules-v1 bundle.
   * Never read from URL parameters or storage.
   */
  readonly VITE_SHATEKKI_BUNDLE?: string;
}
