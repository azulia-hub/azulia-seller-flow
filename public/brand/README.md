# Azulia brand assets

Source: `logo/Refined AZULIA Geometric Logo.png` (preserved unchanged).

Background removal: built-in image_gen tool, background-extraction edit, transparent alpha enabled. Saved result: `public/brand/azulia-logo.png`. Web delivery: 240px WebP (~22 KB) and 64px PNG browser icon, encoded from the transparent result. Assets use Vite BASE_URL so subdirectory hosting works.

Final edit prompt:

> Use case: background-extraction. Edit target: supplied AZULIA logo. Remove the entire ivory textured paper background and cast shadows onto paper, including all paper visible inside enclosed letter/geometry cutouts. Preserve the original exact geometric gold/charcoal metallic emblem and the exact AZULIA lettering, original proportions, gold metallic highlights and edges. No redesign, no added elements, no new text. Output a clean isolated logo with actual transparent alpha, tightly framed with small even padding, suitable for website branding.

Presentation uses warm ivory and charcoal surfaces, gold actions/selection, gold sales trends and distinct green/red financial semantics. The full-resolution result is retained for reuse; ordinary app views load the small WebP.

Installation assets: app-192.png/app-512.png place the transparent artwork on warm ivory; app-maskable-512.png keeps the complete artwork inside the central circular safe zone for platform masks; apple-touch-icon.png supplies iPhone/iPad branding. These are scaled/composited from the existing isolated artwork, not a redesigned logo.
