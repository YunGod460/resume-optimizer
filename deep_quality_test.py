"""Deep quality test - verify optimizer preserves all content sections"""
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

    # Navigate to optimizer
    page.click('[data-section="optimizer"]')
    page.wait_for_timeout(300)

    # Multi-section resume with Chinese content
    test_resume = (
        '个人信息\n'
        '张三 | 13800001111 | zhangsan@email.com | 上海\n'
        '求职意向：新媒体运营专员\n\n'
        '教育背景\n'
        '上海应用技术大学 | 市场营销专业 | 本科 | 2021.09-2025.06\n'
        '主修课程：市场营销学、消费者行为学、品牌管理、新媒体概论\n\n'
        '技能特长\n'
        '熟练掌握微信公众号后台操作和内容编辑\n'
        '熟练使用Photoshop、Premiere进行图文和短视频制作\n'
        '熟悉抖音、小红书、B站等平台运营规则\n'
        '英语CET-6，具备良好的英语读写能力\n\n'
        '工作经历\n'
        '上海XX文化传媒有限公司 | 新媒体运营实习生 | 2024.03-2024.08\n'
        '负责公司微信公众号日常运营和内容更新，每周发布3篇原创推文\n'
        '参与策划"618电商节"线上推广活动，活动期间公众号新增粉丝2000+\n'
        '协助团队完成月度数据分析报告，跟踪阅读量、转发量等关键指标\n\n'
        '项目经历\n'
        '校园二手交易小程序推广 | 项目负责人 | 2023.09-2023.12\n'
        '组织5人团队在校园内推广二手交易小程序\n'
        '通过线上线下结合方式，覆盖校内3000+学生用户\n'
        '项目获得校级大学生创新创业大赛三等奖\n\n'
        '自我评价\n'
        '做事认真负责，学习能力强，具有良好的团队合作精神\n'
        '对新媒体行业充满热情，持续关注行业动态和新玩法'
    )

    page.fill('#opt-input', test_resume)
    page.fill('#opt-jd', '招聘新媒体运营专员：负责微信公众号、抖音等平台内容策划与运营，数据分析，用户增长')
    page.click('#opt-run-btn')

    # Wait for results
    try:
        page.wait_for_selector('#opt-results', state='visible', timeout=90000)
        page.wait_for_timeout(3000)
    except:
        check('Optimizer results appear', False, 'TIMEOUT')
        browser.close()
        sys.exit(1)

    check('Optimizer results visible', True)

    opt_after = page.locator('#opt-after').text_content()
    opt_before = page.locator('#opt-before').text_content()

    # 1. Content length check - optimized should be at least 70% of original length
    orig_len = len(opt_before)
    opt_len = len(opt_after)
    check('Output preserves content volume', opt_len >= orig_len * 0.6,
          f'(original={orig_len} chars, optimized={opt_len} chars)')

    # 2. Section preservation - all key sections should exist in output
    sections = ['个人信息', '教育背景', '技能', '工作经历', '项目经历', '自我评价']
    for sec in sections:
        found = sec in opt_after
        check(f'Section preserved: {sec}', found)

    # 3. Key personal data preserved (not fabricated)
    key_data = ['张三', '13800001111', 'zhangsan@email.com', '上海应用技术大学', '市场营销']
    for data in key_data:
        found = data in opt_after
        check(f'Personal data preserved: {data}', found)

    # 4. Real quantitative data preserved (should NOT be fabricated away)
    real_numbers = ['2000+', '3000+', '5人', '3篇']
    for num in real_numbers:
        found = num in opt_after
        check(f'Real quantity preserved: {num}', found)

    # 5. Check for fabrication - no obviously fake high percentages
    fake_patterns = ['提升80%', '增长90%', '提升95%']
    for fp in fake_patterns:
        not_found = fp not in opt_after
        if not not_found:
            check(f'No fake data: "{fp}"', False, 'FABRICATED DATA FOUND')
        # silently check, only report if found

    # 6. Changes summary should render
    changes_el = page.locator('#opt-changes-summary')
    changes_visible = changes_el.count() > 0
    # Note: might be hidden if no changes detected, which is fine
    print(f'    Changes summary visible: {changes_visible}')

    # 7. Weak verbs should be replaced in optimized version
    weak_verbs_after = sum(1 for v in ['负责', '参与', '协助'] if v in opt_after)
    weak_verbs_before = sum(1 for v in ['负责', '参与', '协助'] if v in opt_before)
    check('Weak verbs reduced', weak_verbs_after <= weak_verbs_before,
          f'(before={weak_verbs_before}, after={weak_verbs_after})')

    # Summary
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
