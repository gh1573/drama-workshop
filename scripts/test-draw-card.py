"""片头卡排版单测：layout 决策断言 + 渲染像素溢出断言。

断言纪律：
1. 正常剧名（含 12 字内含「·」）：单行完整保留，不截断；
2. 长剧名（含多「·」）：拆两行，两行拼回 = 原串（去空格），不截断；
3. 病态超长：允许「…」截断，但渲染宽度不溢出；
4. 所有 case 渲染后文字像素左右安全边 ≥ 3% 画幅。
"""
import importlib.util
import sys
from pathlib import Path


def load_mod():
    spec = importlib.util.spec_from_file_location(
        "assemble", Path(__file__).parent / "assemble-episode.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    mod = load_mod()
    from PIL import Image, ImageDraw, ImageFont

    W, H = 1080, 1920
    probe = Image.new("RGB", (W * 2, H * 2))
    d = ImageDraw.Draw(probe)

    def measure(text: str, size: float) -> float:
        return d.textlength(text, font=ImageFont.truetype(str(mod.FONT), round(size)))

    base = 300 * (W * 2) / (720 * 2)
    floor = round(104 * (W * 2) / (720 * 2))
    max_w = (W * 2) * 0.86

    ok = True

    def check(name, cond):
        nonlocal ok
        print(("PASS" if cond else "FAIL"), name)
        ok = ok and cond

    normal = "战神逆袭 · 演示第一集"
    lines, size = mod.layout_card_title(measure, normal, base, floor, max_w)
    check(f"正常剧名单行完整（{lines}）", lines == [normal] and len(lines) == 1)
    check(f"正常剧名字号在[{floor},{round(base)}]（{size}）", floor <= size <= round(base))

    long_t = "战神逆袭 · 龙王归来 · 赘婿隐忍三年受尽欺凌"
    lines, size = mod.layout_card_title(measure, long_t, base, floor, max_w)
    check(
        f"长剧名拆两行不截断（{lines}）",
        len(lines) == 2 and lines == ["战神逆袭 · 龙王归来", "赘婿隐忍三年受尽欺凌"],
    )
    check(
        "长剧名两行均不超宽",
        all(measure(t, size) <= max_w for t in lines),
    )

    patho = "超长病态剧名" * 8
    lines, size = mod.layout_card_title(measure, patho, base, floor, max_w)
    check(f"病态剧名走兜底（{len(lines[0])} 字 + …）", "…" in lines[0] and size == floor)

    # 渲染像素断言
    out_dir = Path("/tmp/cardtest")
    out_dir.mkdir(exist_ok=True)
    for name, title in {
        "card-normal": normal,
        "card-split": long_t,
        "card-pathologic": patho,
    }.items():
        path = out_dir / f"{name}.png"
        mod.draw_card(str(path), title, 1, W, H)
        im = Image.open(path)
        px = im.load()
        min_x, max_x = W, 0
        for y in range(int(H * 0.35), int(H * 0.75)):
            for x in range(W):
                r, g, b = px[x, y]
                if r + g + b > 240:
                    min_x = min(min_x, x)
                    max_x = max(max_x, x)
        ml, mr = min_x, W - 1 - max_x
        check(f"{name} 像素安全边 l={ml} r={mr}", ml >= W * 0.03 and mr >= W * 0.03)

    print("ALL PASS" if ok else "HAS FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
