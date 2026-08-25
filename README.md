# art/

`field.jpg` is the only background the app loads. It is a composite of the four
`bloom-*.jpg` pieces, built by `tools/build-field.py`. Edit the `PLATES` list in
that script and re-run it to change the field.

The `bloom-*.jpg` files are kept as the sources for that build. Nothing in the
app requests them.

`numio-mark.*` is the animated wordmark used in the nav bar — WebM first, MP4 as
the fallback for Safari, and a JPEG poster. The clip is graded so its own ground
is the paper colour and it carries a feathered mask, because blend modes are not
reliable on video: a compositor hands video its own layer, so the ground has to
match rather than be blended away.
