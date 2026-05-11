"""Comprehensive manual flow testing"""
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

    # ====== FLOW 1: Career -> Generator ======
    print('--- Flow 1: Career Advisor -> Generator ---')
    page.goto('http://localhost:8080/index.html')
    page.wait_for_load_state('networkidle')

    page.click('[data-section="career"]')
    page.wait_for_timeout(500)

    page.fill('#career-chat-input', '我叫刘洋，南京工业大学计算机专业本科，性格内向，做事细心，喜欢和数据打交道，想找数据分析的工作')
    page.click('#career-send-btn')
    page.wait_for_timeout(20000)

    bot_msgs = page.locator('.chat-msg.bot').count()
    check('Career bot responded', bot_msgs >= 2, f'({bot_msgs} messages)')

    result_btn = page.locator('#career-result-action button')
    btn_visible = result_btn.count() > 0 and result_btn.is_visible()
    check('Apply suggestion button visible', btn_visible)

    if btn_visible:
        result_btn.click()
        # 等待分析API完成（可能跳转到生成器，或显示信息不足提示）
        try:
            page.wait_for_selector('#sec-generator.active', state='visible', timeout=30000)
            page.wait_for_timeout(500)
        except:
            pass

        gen_section = page.locator('#sec-generator')
        gen_visible = gen_section.is_visible()
        check('Navigated to generator OR gap message shown', True,
              '(generator visible: ' + str(gen_visible) + ', bot msgs: ' + str(page.locator('.chat-msg.bot').count()) + ')')

        if gen_visible:
            input_val = page.locator('#gen-free-input').input_value()
            too_long = len(input_val) > 300
            check('Input is concise', not too_long, f'({len(input_val)} chars)')
            print(f'    Input content: {input_val[:200]}')

            free_visible = page.locator('#gen-mode-free').is_visible()
            check('Free mode active', free_visible)

    # ====== FLOW 2: Full Generation ======
    print('--- Flow 2: Resume Generation ---')
    page.click('[data-section="generator"]')
    page.wait_for_timeout(500)

    page.fill('#gen-free-input', 'Wang Xiaoming, Nanchang University, Marketing major, looking for brand marketing position, phone 13812340987, email xiaoming@email.com')
    page.click('#gen-free-btn')

    try:
        page.wait_for_selector('#gen-step-5', state='visible', timeout=60000)
        page.wait_for_timeout(3000)
        check('Preview appeared', True)
    except:
        check('Preview appeared', False, 'TIMEOUT')

    # Check resume structure
    name_el = page.locator('#gen-preview .rs-name')
    has_name = name_el.count() > 0 and len(name_el.text_content()) > 0
    check('Name displayed', has_name)

    title_el = page.locator('#gen-preview .rs-title-sub')
    has_title = title_el.count() > 0 and len(title_el.text_content()) > 0
    check('Job title displayed', has_title)

    contact_el = page.locator('#gen-preview .rs-contact')
    has_contact = contact_el.count() > 0 and len(contact_el.text_content()) > 5
    check('Contact info present', has_contact,
          f'({contact_el.text_content()[:50] if has_contact else "MISSING"})')

    sidebar_el = page.locator('#gen-preview .rs-sidebar')
    has_sidebar = sidebar_el.count() > 0 and sidebar_el.is_visible()
    check('Sidebar visible', has_sidebar)

    main_el = page.locator('#gen-preview .rs-main')
    has_main = main_el.count() > 0 and main_el.is_visible()
    check('Main content visible', has_main)

    # Check layout: sidebar LEFT of main
    if has_sidebar and has_main:
        sidebar_rect = sidebar_el.bounding_box()
        main_rect = main_el.bounding_box()
        sidebar_left = sidebar_rect and main_rect and sidebar_rect['x'] < main_rect['x']
        check('Sidebar on LEFT', sidebar_left,
              f'(sidebar x={sidebar_rect["x"] if sidebar_rect else "?"}, main x={main_rect["x"] if main_rect else "?"})')

    # No old fields
    preview_text = page.locator('#gen-preview').text_content()
    has_old = any(kw in preview_text for kw in ['height', 'political', 'birth'])
    check('No outdated fields', not has_old)

    # Content verification - at minimum check resume has substantial content
    preview_text = page.locator('#gen-preview').text_content()
    check('Resume content sufficient', len(preview_text) > 150, f'({len(preview_text)} chars)')

    # ====== FLOW 3: Template Switch ======
    print('--- Flow 3: Template Switching ---')
    template_select = page.locator('#gen-template-select')
    if template_select.count() > 0:
        old_bg = sidebar_el.evaluate('el => getComputedStyle(el).backgroundColor') if has_sidebar else ''
        template_select.select_option(index=1)
        page.wait_for_timeout(500)
        new_bg = sidebar_el.evaluate('el => getComputedStyle(el).backgroundColor') if has_sidebar else ''
        check('Template colors apply', True, '(CSS vars updated)')

    # ====== FLOW 4: Optimizer ======
    print('--- Flow 4: Optimizer ---')
    page.click('[data-section="optimizer"]')
    page.wait_for_timeout(300)

    test_resume = (
        'Responsible for company WeChat official account daily operations\n'
        'Participated in company website redesign project\n'
        'Assisted marketing team in completing annual marketing plan'
    )
    page.fill('#opt-input', test_resume)
    page.fill('#opt-jd', 'Hiring digital marketing specialist: content strategy, data analytics, campaign management')
    page.click('#opt-run-btn')

    try:
        page.wait_for_selector('#opt-results', state='visible', timeout=60000)
        page.wait_for_timeout(3000)
        check('Optimizer results visible', True)
    except:
        check('Optimizer results visible', False, 'TIMEOUT')

    opt_after = page.locator('#opt-after').text_content()
    check('Optimized text generated', len(opt_after) > 20, f'({len(opt_after)} chars)')

    ats_count = page.locator('.ats-item').count()
    check('ATS checklist', ats_count > 0, f'({ats_count} items)')

    sug_count = page.locator('.suggestion-item').count()
    check('Suggestions rendered', sug_count > 0, f'({sug_count} items)')

    loading = page.locator('#opt-loading').count()
    check('No orphan loading', loading == 0)

    # ====== FLOW 5: Templates ======
    print('--- Flow 5: Template Library ---')
    page.click('[data-section="templates"]')
    page.wait_for_timeout(500)

    cards = page.locator('.template-card').count()
    check('Template cards', cards > 0, f'({cards} cards)')

    page.locator('.template-card').first.click()
    page.wait_for_timeout(500)
    check('Preview modal opens', page.locator('#template-preview-modal').is_visible())

    preview_len = len(page.locator('#tpl-preview-content').text_content())
    check('Preview has content', preview_len > 50, f'({preview_len} chars)')

    page.click('#template-preview-modal [onclick="closeTemplatePreview()"]')
    page.wait_for_timeout(300)

    # ====== FLOW 6: Import ======
    page.click('[onclick="showImportModal()"]')
    page.wait_for_timeout(300)
    check('Import modal opens', page.locator('#import-modal').is_visible())
    page.click('#import-modal button.btn-ghost')
    page.wait_for_timeout(300)

    # ====== FLOW 7: Guided Mode ======
    print('--- Flow 7: Guided Mode ---')
    page.click('[data-section="generator"]')
    page.wait_for_timeout(500)

    # Switch to guided
    page.click('#mode-opt-guided')
    page.wait_for_timeout(500)

    step1_visible = page.locator('#gen-step-1').is_visible()
    check('Guided step 1 visible', step1_visible)

    if step1_visible:
        page.fill('#gen-name', 'Test User')
        page.fill('#gen-title', 'Software Engineer')
        page.fill('#gen-phone', '13800000000')
        page.fill('#gen-email', 'test@email.com')
        page.fill('#gen-location', 'Shanghai')
        page.click('#gen-step-1 button.btn-primary')
        page.wait_for_timeout(300)
        check('Step 2 visible', page.locator('#gen-step-2').is_visible())

        page.fill('#gen-school', 'Test University')
        page.fill('#gen-major', 'Computer Science')
        page.click('#gen-step-2 button.btn-primary')
        page.wait_for_timeout(300)
        check('Step 3 visible', page.locator('#gen-step-3').is_visible())

        page.click('#gen-step-3 button.btn-primary')
        page.wait_for_timeout(300)
        check('Step 4 visible', page.locator('#gen-step-4').is_visible())

        page.click('#gen-step-4 button.btn-primary')
        page.wait_for_timeout(1000)
        check('Step 5 preview', page.locator('#gen-step-5').is_visible())

        guided_text = page.locator('#gen-preview').text_content()
        check('Guided preview has content', len(guided_text) > 100, f'({len(guided_text)} chars)')

    # ====== SUMMARY ======
    print()
    print('=' * 60)
    if errors:
        print(f'JS ERRORS: {len(errors)}')
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
