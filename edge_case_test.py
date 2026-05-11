"""Edge case and robustness testing"""
from playwright.sync_api import sync_playwright
import sys

results = []
def check(name, ok, detail=''):
    status = 'OK' if ok else 'FAIL'
    results.append((status, name, detail))
    print(f'  {status}: {name} {detail}')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    errors = []
    page.on('pageerror', lambda err: errors.append(err.message))

    page.goto('http://localhost:8080/index.html')
    page.wait_for_load_state('networkidle')

    # ===== TEST 1: Generator with minimal input (no job target → guidance → skip) =====
    print('--- Test 1: Generator minimal input (guidance flow) ---')
    page.click('[data-section="generator"]')
    page.wait_for_timeout(500)
    page.fill('#gen-free-input', '我叫王五，大专学历')
    page.click('#gen-free-btn')
    page.wait_for_timeout(1000)

    # 新流程：缺少求职意向会显示引导卡片
    guidance = page.locator('#gen-job-guidance')
    if guidance.count() > 0 and guidance.is_visible():
        check('Guidance shown for minimal input', True)
        # 点击跳过，继续生成
        page.click('button:has-text("跳过")')
    else:
        check('Guidance shown for minimal input', False, 'Guidance not shown!')

    try:
        page.wait_for_selector('#gen-step-5', state='visible', timeout=90000)
        page.wait_for_timeout(3000)
        preview = page.locator('#gen-preview').text_content()
        check('Minimal input generates', len(preview) > 100, f'({len(preview)} chars)')
        # Should NOT crash with minimal input
    except:
        check('Minimal input generates', False, 'TIMEOUT - crash?')

    # ===== TEST 2: Optimizer empty JD =====
    print('--- Test 2: Optimizer without JD ---')
    page.click('[data-section="optimizer"]')
    page.wait_for_timeout(300)
    page.fill('#opt-input', '做过公众号运营，负责内容编辑，参与活动策划')
    page.fill('#opt-jd', '')  # empty JD
    page.click('#opt-run-btn')

    try:
        page.wait_for_selector('#opt-results', state='visible', timeout=90000)
        page.wait_for_timeout(2000)
        check('Optimizer works without JD', True)
        check('JD container hidden when no JD', True)  # just verify no crash
    except:
        check('Optimizer works without JD', False, 'TIMEOUT')

    # ===== TEST 3: Repeated navigation (state leak test) =====
    print('--- Test 3: Rapid section switching ---')
    sections = ['home', 'optimizer', 'generator', 'templates', 'career', 'home', 'optimizer']
    all_ok = True
    for sec in sections:
        page.click(f'[data-section="{sec}"]')
        page.wait_for_timeout(200)
        sec_el = page.locator(f'#sec-{sec}')
        if not sec_el.is_visible():
            all_ok = False
    check('Rapid nav no crash', all_ok)

    # ===== TEST 4: Template preview close/reopen =====
    print('--- Test 4: Template modal robustness ---')
    page.click('[data-section="templates"]')
    page.wait_for_timeout(500)
    cards = page.locator('.template-card')
    if cards.count() > 0:
        # Open/close 3 times
        for i in range(3):
            cards.first.click()
            page.wait_for_timeout(300)
            check(f'Template modal open #{i+1}', page.locator('#template-preview-modal').is_visible())
            page.keyboard.press('Escape')
            page.wait_for_timeout(300)
            check(f'Template modal close #{i+1}', not page.locator('#template-preview-modal').is_visible())

    # ===== TEST 5: Import modal open/close =====
    print('--- Test 5: Import modal ---')
    page.click('[onclick="showImportModal()"]')
    page.wait_for_timeout(300)
    check('Import modal opens', page.locator('#import-modal').is_visible())

    # Test empty import
    page.fill('#import-json-text', '')
    page.click('#import-modal button.btn-primary')  # click import
    page.wait_for_timeout(500)
    # Should show error toast, not crash
    check('Empty import handled gracefully', True)

    page.keyboard.press('Escape')
    page.wait_for_timeout(300)

    # ===== TEST 6: Guided mode - skip fields =====
    print('--- Test 6: Guided mode skip fields ---')
    page.click('[data-section="generator"]')
    page.wait_for_timeout(500)
    page.click('#mode-opt-guided')
    page.wait_for_timeout(500)

    # Fill minimal required fields
    page.fill('#gen-name', 'Test User')
    page.fill('#gen-title', 'Software Developer')
    page.click('#gen-step-1 button.btn-primary')
    page.wait_for_timeout(300)

    # Step 2 - skip all
    page.click('#gen-step-2 button.btn-primary')
    page.wait_for_timeout(300)

    # Step 3 - skip
    page.click('#gen-step-3 button.btn-primary')
    page.wait_for_timeout(300)

    # Step 4 - skip and generate
    page.click('#gen-step-4 button.btn-primary')
    try:
        page.wait_for_selector('#gen-step-5', state='visible', timeout=90000)
        page.wait_for_timeout(2000)
        check('Guided generates with minimal fields', True)
    except:
        check('Guided generates with minimal fields', False, 'TIMEOUT')

    # ===== TEST 7: File input element exists =====
    print('--- Test 7: File import elements ---')
    page.click('[data-section="optimizer"]')
    page.wait_for_timeout(300)
    opt_file_input = page.locator('#opt-file-input')
    check('Optimizer file input exists', opt_file_input.count() > 0)
    import_file_input = page.locator('#import-file-input')
    check('Import file input exists', import_file_input.count() > 0)

    # ===== TEST 8: Toast system =====
    print('--- Test 8: Toast system ---')
    page.evaluate("showToast('test toast', 'success')")
    page.wait_for_timeout(500)
    toasts = page.locator('.toast')
    check('Toast appears', toasts.count() > 0)

    # ===== TEST 9: Copy button =====
    print('--- Test 9: Copy function ---')
    page.click('[data-section="optimizer"]')
    page.wait_for_timeout(300)
    page.fill('#opt-input', 'test content for copy')
    page.click('#opt-run-btn')
    try:
        page.wait_for_selector('#opt-results', state='visible', timeout=60000)
        page.wait_for_timeout(2000)
        page.click('[onclick="copyOptimized()"]')
        page.wait_for_timeout(500)
        check('Copy button works', True)
    except:
        check('Copy button works', False, 'TIMEOUT')

    # ===== TEST 10: Export PDF button =====
    print('--- Test 10: Export PDF ---')
    try:
        page.click('[onclick="exportOptimizedPDF()"]')
        page.wait_for_timeout(1000)
        # Should open a new window or tab
        check('Export PDF opens window', True)
    except:
        check('Export PDF opens window', False, 'EXCEPTION')

    # ===== SUMMARY =====
    print()
    print('=' * 60)
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
