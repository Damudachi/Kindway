# Fonts

`Fraunces_SoftTitle.ttf` (page titles) and `Fraunces_SoftHeading.ttf` (section headings) are static cuts of
Fraunces (SIL OFL 1.1, see `Fraunces-OFL.txt`): SemiBold 600, SOFT 100, WONK 1, at optical size 72 and 24.
The npm package `@expo-google-fonts/fraunces` only ships the default (sharp) cuts, so these are made from the
variable font in google/fonts (`ofl/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf`):

    pip install fonttools
    python make-fraunces.py <path to Fraunces[SOFT,WONK,opsz,wght].ttf> assets/fonts

Edit the script, never the TTFs.
