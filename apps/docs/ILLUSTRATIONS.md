# Help center illustrations

How the category cards were made, so new ones match, and how the social image is built from the logo.

## Style: sliced ink

- The whole image is made **only of perfectly horizontal straight lines** with rounded caps, all the same thin stroke weight, on an evenly spaced horizontal grid.
- Shapes come from where each line starts and stops. Small deliberate gaps inside a row draw the detail (leaf veins, rims, highlights, keys).
- Ink is near-black `#111110`. **Exactly one small red accent**, about three short segments, in `#c8342b`.
- Flat: no shading, no gradients, no outlines, no texture.
- One object, centred, generous empty space, transparent background.
- No people, faces, readable text or logos. Never draw a bonsai: the bonsai is the Todalo logo, and only the real logo file is used for it.

## Generating a new image

- Tool: Higgsfield, model `gpt_image_2_6`, `quality: high`, `background: transparent`, aspect `3:2`.
- Pass **two references** as `image_references`:
  - the original style reference, job `120e458a-b087-435a-b78f-ff1b89f7e184`;
  - the Integrations card for line weight, job `4759dc55-36db-41fd-ab9a-30d98003d9cf`.
- Prompt template (replace the subject and where the red goes):

  > Match the reference images' style exactly, using the thinner line weight of the plug image: the image is made ONLY of perfectly horizontal straight lines with rounded caps, all the same stroke weight, on an exact evenly spaced horizontal grid; silhouettes come from where each line starts and stops, and small deliberate gaps within rows draw detail. Solid near-black ink #111110; exactly three short segments in red #c8342b; flat, no shading, no gradients, no outlines. Subject: **…**; gaps draw **…**. The red segments **…**. Centred with generous empty space. Transparent background. No text, no people, no extra objects.

- Check the result on both `#f6f5f2` and `#121211` (with the dark-mode filter below) before using it.

## Files

| File | Subject | Higgsfield job |
|---|---|---|
| `public/illustrations/get-started.webp` | Seedling in a pot | `3aa2b74e-7feb-4a82-85db-7d09067e3e36` |
| `public/illustrations/tasks-capture.webp` | Task card with tick | `286b6406-f3e3-48b0-a65a-319dc83af876` |
| `public/illustrations/organise-views.webp` | Shelves | `e02fdb39-fc78-4e82-bdf4-9d617550f0a3` |
| `public/illustrations/goals-seasons-rituals.webp` | Mountain path and flag | `3d5bfb2c-99c1-4bef-aa08-4953d29a627a` |
| `public/illustrations/coach.webp` | The app's Coach button with sparkle | `fbf2fab7-cc93-4b7e-8154-ddf4b693524c` |
| `public/illustrations/integrations.webp` | Plug and socket | `4759dc55-36db-41fd-ab9a-30d98003d9cf` |
| `public/illustrations/apps-account.webp` | Laptop | `d4117f76-9d2d-4e2b-a48e-5bf6162b2796` |
| `public/og.jpg` | The Todalo logo (`public/todalo-logo.svg`) centred on `#f6f5f2`, 1200×630 | not generated |

Rebuild the social image from the logo with `rsvg-convert -w 420 public/todalo-logo.svg -o /tmp/logo.png && magick -size 1200x630 xc:"#f6f5f2" /tmp/logo.png -gravity center -composite -quality 90 public/og.jpg`.

Convert new PNGs with `cwebp -q 85 -alpha_q 100 -resize 800 0 in.png -o out.webp`.

## Dark mode

There is one file per image. In dark mode, CSS flips the ink to light and keeps the red (`.dark .illustration img { filter: invert(1) hue-rotate(180deg); }` in `app/globals.css`). The red comes out a little lighter on dark; that is accepted.
