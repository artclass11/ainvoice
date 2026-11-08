# AInvoice Hindi Product Promo

A 25-second, vertical Hindi promotional cut for AInvoice, following the DOCS product-film workflow.

## Master specifications

- Runtime: 25 seconds
- Frame: 1080 × 1920 (9:16)
- Frame rate: 24 fps
- Picture: H.264 / yuv420p
- Audio: AAC, 48 kHz, stereo
- Captions: Hindi, burned into the picture; matching SRT supplied separately
- Audio content: original procedural instrumental score; spoken narration is not embedded

The MP4 master and complete editable production ZIP were delivered separately. This GitHub folder contains the editorial and release-support files; the MP4 binary is not stored in this commit.

## Project files

- [Hindi SRT subtitles](./ainvoice_promo_hindi.srt)
- [Hindi voiceover script and recording notes](./hindi_voiceover_script.md)
- [Shot manifest and claim references](./shot_manifest.json)
- [Technical QC report and outstanding release gates](./QC_REPORT.json)

## Visual and production approach

The cut uses original procedural 2.5D/3D motion, illustrative interface screens, animated product and payment concepts, a custom synthesized instrumental score, and Hindi on-screen copy. It does not use stock video or stock music. The UI shown is a promotional illustration, not a screen recording of the live application. Any sample figures in the illustrative screens are not AInvoice customer or transaction data.

## Confirmed feature claims

The copy is based on the AInvoice repository documentation:

- Local product catalogue and customer book
- Multi-item sales invoices, configurable tax rates and payment capture
- Cash, UPI, bank and card payment method options
- Optional stock tracking and low-stock count
- Basic sales and collections reports
- AES-256-GCM encrypted backup export and restore
- English, Hindi and Marathi interface foundations

## Required product disclosures

AInvoice is in early development. The promo must not be interpreted as a claim that AInvoice is production-ready accounting software, or certified for GST, e-invoicing, IRN or e-way bills.

The exported backup is encrypted. Current live browser/WebView IndexedDB data is not automatically encrypted at rest; the local PIN is an app-entry lock, not database encryption. The promo includes this distinction.

## Voiceover and release status

The MP4 contains music and on-screen Hindi copy, but no spoken narration. The Hindi narration script is supplied separately. A narration take must be added and the final mix rechecked before a voice-led public release.

Technical inspection of the exact MP4 passed: stream metadata, 25-second duration, 1080×1920 resolution, 24 fps and full-file FFmpeg decode. Creative approval remains **HOLD** until a human reviewer watches and listens to the exact final export, checks the captions and audio, and records a timestamped PASS/REVISE decision.

## DOCS workflow

The project follows the AInvoice/DOCS promotional-film principles: source every product claim against the repository, make UI reconstructions clearly illustrative, separate technical QC from human creative approval, and do not publish while a critical review gate is unresolved.
