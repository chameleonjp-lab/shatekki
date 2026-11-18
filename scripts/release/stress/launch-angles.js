// This module replaces the normal muzzle pattern in this fixture's build only.
export function launchAngles({ spreadRad }) {
  return [-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5].map(offset => offset * spreadRad);
}
