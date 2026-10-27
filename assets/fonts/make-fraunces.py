import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

src, out_dir = sys.argv[1], sys.argv[2]
# Kindway's title cuts: SemiBold, fully soft, Fraunces' own wonk default, at two optical sizes.
for name, opsz in (("Fraunces_SoftTitle", 72), ("Fraunces_SoftHeading", 24)):
    f = TTFont(src)
    inst = instantiateVariableFont(f, {"opsz": opsz, "wght": 600, "SOFT": 100, "WONK": 1})
    for rec in inst["name"].names:
        if rec.nameID in (1, 4, 16):
            rec.string = name.replace("_", " ")
        elif rec.nameID == 6:
            rec.string = name.replace("_", "-")
    inst.save(f"{out_dir}/{name}.ttf")
    print(name, "ok")
