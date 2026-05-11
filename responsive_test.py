"""Responsive design test at multiple viewports"""
from playwright.sync_api import sync_playwright
import sys

results = []
def check(name, ok, detail=''):
    status = 'OK' if ok else 'FAIL'
    results.append((status, name, detail))
    print(f'  {status}: {name} {detail}')

viewports = [
    ('mobile', 375, 812),
    ('tablet', 768, 1024),
    ('desktop', 1440, 900)
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    errors = []

    for vp_name, vp_w, vp_h in viewports:
        print(f'\n=== {vp_name} ({vp_w}x{vp_h}) ===')
        page = browser.new_page(viewport={'width': vp_w, 'height': vp_h})
        page.on('pageerror', lambda err: errors.append(f'[{vp_name}] {err.message}'))

        page.goto('http://localhost:8080/index.html')
        page.wait_for_load_state('networkidle')

        # 1. Navigation visible and not cut off
        nav = page.locator('.nav')
        check(f'[{vp_name}] Nav visible', nav.is_visible())

        # 2. Hero section visible
        hero = page.locator('.hero')
        check(f'[{vp_name}] Hero visible', hero.is_visible())

        # 3. Feature grid visible
        features = page.locator('.feature-card').count()
        check(f'[{vp_name}] Feature cards visible', features > 0, f'({features} cards)')

        # 4. Navigate to optimizer
        page.click('[data-section="optimizer"]')
        page.wait_for_timeout(300)
        opt_section = page.locator('#sec-optimizer')
        check(f'[{vp_name}] Optimizer section visible', opt_section.is_visible())

        # 5. Textarea accessible
        textarea = page.locator('#opt-input')
        check(f'[{vp_name}] Textarea accessible', textarea.is_visible())

        # 6. Navigate to templates
        page.click('[data-section="templates"]')
        page.wait_for_timeout(500)
        grid = page.locator('#template-grid')
        check(f'[{vp_name}] Template grid visible', grid.is_visible())

        # 7. No horizontal overflow
        overflow = page.evaluate("""() => {
            return document.documentElement.scrollWidth > window.innerWidth;
        }""")
        check(f'[{vp_name}] No horizontal overflow', not overflow)

        # 8. Buttons are clickable (not overlapped)
        if vp_name == 'mobile':
            # Check if hero buttons are still accessible
            btns = page.locator('.hero-actions .btn').count()
            check(f'[{vp_name}] Hero buttons accessible', btns >= 2, f'({btns} buttons)')

        page.close()

    print(f'\n{"="*60}')
    if errors:
        print(f'JS ERRORS ({len(errors)}):')
        for e in errors:
            print(f'  {e}')
    else:
        print('NO JS ERRORS')

    fails = [r for r in results if r[0] == 'FAIL']
    ok_count = len([r for r in results if r[0] == 'OK'])
    print(f'TOTAL: {ok_count} OK, {len(fails)} FAIL, {len(errors)} JS errors')
    for f in fails:
        print(f'  FAIL: {f[1]} - {f[2]}')

    browser.close()
    sys.exit(1 if fails or errors else 0)
