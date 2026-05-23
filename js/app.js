/* ===== ResumePro v3 - DeepSeek + Dynamic Templates + Edit ===== */

// ===== API CONFIG =====
// 安全警告：API Key 在前端代码中完全可见。
// 生产环境应将请求转发到自己的后端服务，避免 Key 泄露。
// 临时解决方案：在 DeepSeek 控制台设置用量限制和频率限制。
var DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
var DEEPSEEK_KEY = 'sk-777966a396474b328c5afbafdd8eed34';
// 模型分工：Pro用于质量优先(生成/优化)，Flash用于速度/成本优先(分析/提取)
var MODEL = {
  PRO: 'deepseek-v4-pro',
  FLASH: 'deepseek-v4-flash',
  // 根据任务自动选择
  forTask: function(task) {
    if (task === 'generation' || task === 'optimization') return this.PRO;
    return this.FLASH; // analysis, extraction, jd-matching
  }
};

// ========== STATE ==========
var state = {
  currentSection: 'home',
  generator: { step: 1, initialized: false, mode: 'free',
    name:'',title:'',phone:'',email:'',location:'',
    school:'',major:'',degree:'本科',eduStart:'',eduEnd:'',majorCourses:'',
    summary:'',selfEval:'',experiences:[],skills:[],certs:[],languages:'',campusExp:''
  },
  templates: { default: null, library: [], imported: [] },
  selectedTemplate: 'default',
  optimizerResult: null,
  selectedTemplateId: null,
  editingElement: null
};

// ========== NAVIGATION ==========
function switchSection(section) {
  state.currentSection = section;
  document.querySelectorAll('.section').forEach(function(s){s.classList.remove('active');});
  document.querySelectorAll('.nav-btn').forEach(function(b){b.classList.remove('active');});
  document.querySelectorAll('.bn-btn').forEach(function(b){b.classList.remove('active');});
  var sec = document.getElementById('sec-'+section); if(sec)sec.classList.add('active');
  var nav = document.querySelector('.nav-btn[data-section="'+section+'"]'); if(nav)nav.classList.add('active');
  var bn = document.querySelector('.bn-btn[data-section="'+section+'"]'); if(bn)bn.classList.add('active');
  if(section==='templates') renderTemplateGrid();
  if(section==='generator' && !state.generator.initialized) initGenerator();
  if(section==='career' && document.getElementById('career-chat-messages').children.length <= 1) {
    // 首次打开，滚动到底部
    setTimeout(function(){
      var mc = document.getElementById('career-chat-messages');
      if(mc) mc.scrollTop = mc.scrollHeight;
    }, 100);
  }
}
document.getElementById('nav').addEventListener('click',function(e){
  var btn=e.target.closest('.nav-btn'); if(btn)switchSection(btn.dataset.section);
});
document.getElementById('bottom-nav').addEventListener('click',function(e){
  var btn=e.target.closest('.bn-btn'); if(btn)switchSection(btn.dataset.section);
});

// ========== TOAST ==========
function showToast(msg,type){
  var c=document.getElementById('toast-container');
  var t=document.createElement('div');t.className='toast '+(type||'success');t.textContent=msg;c.appendChild(t);
  setTimeout(function(){t.style.opacity='0';setTimeout(function(){t.remove();},300);},3000);
}

// ========== DEEPSEEK API ==========
// model: 可选 'pro'|'flash'，默认flash（节省成本）
// systemMsg: 可选，作为system角色发送（用于对话类任务）
function callDeepSeek(prompt, callback, opt_model, systemMsg) {
  var model = opt_model === 'pro' ? MODEL.PRO : MODEL.FLASH;
  var xhr = new XMLHttpRequest();
  xhr.open('POST', DEEPSEEK_URL, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Authorization', 'Bearer ' + DEEPSEEK_KEY);
  xhr.timeout = 60000;
  xhr.onload = function() {
    if (xhr.status === 200) {
      try {
        var resp = JSON.parse(xhr.responseText);
        var text = resp.choices && resp.choices[0] ? resp.choices[0].message.content : '';
        callback(null, text);
      } catch(e) { callback(e); }
    } else {
      var errMsg = 'API请求失败(' + xhr.status + ')';
      try { var errResp = JSON.parse(xhr.responseText); if (errResp.error) errMsg += ': ' + errResp.error.message; } catch(e) {}
      callback(new Error(errMsg));
    }
  };
  xhr.onerror = function() { callback(new Error('网络连接失败，请检查网络后重试')); };
  xhr.ontimeout = function() { callback(new Error('请求超时，请稍后重试')); };
  // 根据任务类型分配合理token数
  var isGenerator = prompt.indexOf('"experiences"') !== -1;
  var isAnalysis = prompt.indexOf('提取') !== -1;
  // 生成完整简历需要更多token；分析类精简；其他任务中等
  var maxTokens = 4096;
  if (isGenerator) maxTokens = 4096;       // 完整简历生成需大token
  else if (isAnalysis) maxTokens = 1024;    // 信息提取保持精简
  var messages = [];
  if (systemMsg) messages.push({ role: 'system', content: systemMsg });
  messages.push({ role: 'user', content: prompt });
  xhr.send(JSON.stringify({
    model: model,
    messages: messages,
    max_tokens: maxTokens,
    temperature: isAnalysis ? 0.3 : 0.7,
    thinking: { type: 'disabled' }
  }));
}

// ========== JOB-TARGETED SMART FILL ENGINE ==========
// 核心：根据用户意向岗位（title）精准生成，major仅作辅助
var JOB_PROFILES = {
  // ===== 互联网/技术类 =====
  '前端':{k:'前端开发工程师',c:'互联网/科技',t:['Vue.js','React','JavaScript','HTML5','CSS3','TypeScript','Webpack','Git','Node.js','Element Plus','UniApp','小程序开发','Chrome DevTools','Figma'],
    s:['精通HTML5/CSS3/JavaScript，能独立完成响应式网页开发与移动端适配','熟练使用Vue.js/React全家桶，具备组件化开发与状态管理经验','掌握TypeScript类型系统，编写高质量可维护代码','熟悉Webpack/Vite构建工具链，了解前端工程化与CI/CD流程','熟练使用Git进行团队协作，遵循Git Flow分支管理规范','具备前端性能优化经验，掌握代码分割、懒加载、缓存策略等优化手段','了解Node.js/Express后端开发，具备全栈思维能力','熟练使用Element Plus/Ant Design等UI框架快速搭建中后台系统'],
    se:'热爱前端技术，对用户体验和交互细节有极致追求。具备像素级UI还原能力与良好的代码品味，关注Web标准与前沿技术趋势。善于通过技术博客和开源社区持续学习，自驱力强。期望在前端架构方向持续深耕，成长为全栈工程师。',
    ex:[{c:'XX科技有限公司',t:'前端开发实习生',b:'2024.03',e:'2024.08',d:['S：公司官网首屏加载时间超过5秒，SEO排名持续下滑，用户跳出率达60%。T：负责官网前端性能优化与核心页面重构。A：通过路由懒加载、图片WebP格式转换、CDN缓存策略、Tree Shaking等手段系统优化加载链路，使用Lighthouse逐项分析性能瓶颈并制定优化方案。R：首屏加载时间从5.2秒降至1.4秒（优化73%），Lighthouse评分从45提升至91，页面PV提升40%，SEO排名进入前3页。']},{c:'XX数字科技有限公司',t:'Web前端实习生',b:'2023.07',e:'2024.01',d:['S：公司SaaS管理后台功能迭代缓慢，组件复用率低，代码维护成本高。T：参与后台管理系统Vue3技术栈迁移与组件库搭建。A：主导10+通用业务组件抽离（表格、表单、搜索栏等），制定组件API设计规范与文档，引入Pinia状态管理统一数据流，编写单元测试覆盖核心逻辑。R：组件复用率从20%提升至65%，新页面开发效率提升50%，团队代码冲突减少70%，项目提前2周完成里程碑交付。']}],
    ce:['计算机等级考试二级','软件设计师（初级）','大学英语四级（CET-4）'],
    co:'数据结构、操作系统、计算机网络、Web前端开发、数据库原理、软件工程'},
  '后端':{k:'后端开发工程师',c:'互联网/科技',t:['Java','Python','Go','Spring Boot','MySQL','Redis','Docker','Linux','微服务','RESTful API','MongoDB','Kafka','Nginx','Git'],
    s:['精通Java/Python/Go至少一门后端语言，具备扎实的面向对象编程基础','熟练使用Spring Boot/Django框架，能独立完成RESTful API设计与开发','掌握MySQL/PostgreSQL数据库设计与SQL性能调优','熟悉Redis缓存策略与消息队列（RabbitMQ/Kafka）异步处理','了解Docker容器化部署与Kubernetes基础','熟悉Linux系统操作与Shell脚本自动化','具备良好的系统设计能力，了解微服务架构与分布式系统基础'],
    se:'热爱后端技术，对高并发、高可用系统架构充满热情。具备扎实的计算机基础与底层原理功底，善于从根源分析并解决复杂技术问题。注重代码质量与系统稳定性，追求优雅的架构设计。期望在服务端方向持续深耕，成长为一名优秀的架构师。',
    ex:[{c:'XX信息技术有限公司',t:'Java后端实习生',b:'2024.04',e:'2024.09',d:['S：订单系统在促销高峰期QPS达到500时频繁响应超时，数据库CPU使用率持续100%，严重影响交易成功率。T：负责订单模块性能优化与缓存策略升级。A：使用慢查询日志定位TOP 10瓶颈SQL并优化索引，引入Redis缓存+布隆过滤器解决缓存穿透，实现Canal+MQ异步同步保证数据一致性，搭建JMeter压测环境持续监控性能。R：接口平均响应时间从800ms降至90ms，系统QPS从500提升至2000+，大促期间服务可用性保持99.95%，订单成功率从92%提升至99.5%。']}],
    ce:['计算机等级考试二级','大学英语四级（CET-4）','数据库系统工程师'],
    co:'数据结构与算法、操作系统、计算机网络、数据库原理、软件工程、Java程序设计'},
  '测试':{k:'软件测试工程师',c:'互联网/科技',t:['功能测试','自动化测试','Selenium','JMeter','Postman','Python','SQL','Jenkins','JIRA','测试用例','接口测试','性能测试'],
    s:['熟练掌握软件测试理论与方法，能独立编写高质量的测试用例','熟练使用Postman/JMeter进行接口测试与性能测试','掌握Selenium/Playwright自动化测试框架，能编写可维护的自动化脚本','熟悉MySQL数据库，能编写复杂SQL进行数据验证','了解CI/CD流程，能集成自动化测试到Jenkins流水线','熟练使用JIRA/禅道进行缺陷管理与跟踪'],
    se:'注重细节、逻辑缜密，有强烈的质量意识。善于从用户视角发现问题，能系统性地分析并定位缺陷根因。具备良好的沟通能力，能高效与产品、开发协作推动问题解决。对软件质量保障充满热情，期望成长为高级测试开发工程师。',
    ex:[{c:'XX软件技术有限公司',t:'软件测试实习生',b:'2024.05',e:'2024.10',d:['S：每次版本迭代回归测试耗时3天，严重拖慢发布节奏，且人工测试覆盖率不足60%。T：负责搭建自动化测试框架并建立回归测试流程。A：选用Playwright+Python搭建UI自动化框架，编写200+核心用例脚本，集成Allure生成可视化测试报告，配置Jenkins定时任务实现每日自动回归。R：回归测试从3天缩短至4小时，测试覆盖率从58%提升至85%，上线后P0缺陷从月均5个降至0个，版本发布周期从2周缩短至1周。']}],
    ce:['计算机等级考试二级','大学英语四级（CET-4）','ISTQB初级认证'],
    co:'软件测试、软件工程、数据库原理、数据结构、计算机网络、操作系统'},
  '产品经理':{k:'产品经理/助理',c:'互联网/科技',t:['产品设计','需求分析','PRD','Axure','Figma','用户研究','数据分析','竞品分析','项目管理','SQL','用户画像','A/B测试'],
    s:['熟练使用Axure/Figma进行产品原型设计与交互原型制作','掌握需求分析方法论，能独立撰写高质量PRD文档','熟悉用户研究方法（访谈、问卷、可用性测试），善于洞察用户痛点','具备数据分析能力，能通过SQL/Excel进行数据提取与业务分析','了解敏捷开发流程，能高效协调设计、开发、测试推进产品迭代','善于竞品分析，能快速把握行业趋势与差异化机会'],
    se:'以用户为中心的产品思维，善于从数据和用户反馈中发现真需求。具备较强的逻辑分析能力和同理心，能平衡用户需求与商业目标。沟通协调能力突出，能有效推动跨团队协作。对产品的每个细节都有高标准要求，期望打造真正解决问题的好产品。',
    ex:[{c:'XX网络科技有限公司',t:'产品助理实习生',b:'2024.03',e:'2024.08',d:['S：公司内部CRM系统使用率仅30%，销售团队反馈操作复杂、数据查询慢，不愿使用。T：负责CRM系统重构的需求调研与产品方案设计。A：深度访谈15名销售用户，梳理核心痛点矩阵，输出竞品分析报告，使用Figma设计新版本交互原型，组织3轮可用性测试迭代优化，编写详细PRD并跟进开发全流程。R：新版上线后系统日活从30%提升至82%，销售团队好评率92%，数据查询效率提升70%，成为公司内部最受欢迎的工具产品。']}],
    ce:['计算机等级考试二级','大学英语四级（CET-4）','PMP项目管理认证（在读）'],
    co:'软件工程、数据库原理、管理学、市场营销学、心理学导论、人机交互'},
  '数据分析':{k:'数据分析师',c:'互联网/科技',t:['Python','SQL','Excel','Tableau','Power BI','数据可视化','统计学','Pandas','NumPy','A/B测试','数据挖掘','机器学习'],
    s:['精通SQL复杂查询，能高效从海量数据中提取业务洞察','熟练使用Python（Pandas/NumPy/Matplotlib）进行数据处理与可视化分析','掌握Tableau/Power BI等BI工具，能独立搭建业务数据看板','具备扎实的统计学基础，熟悉假设检验、回归分析等常用方法','了解A/B测试原理与实验设计，能推动数据驱动决策','具备良好的业务理解力，善于将数据转化为可落地的业务建议'],
    se:'对数据敏感，善于从杂乱数据中发现隐藏的规律和趋势。具备结构化思维能力，能清晰地将复杂分析过程转化为简洁有力的结论。对数据驱动决策充满信念，追求分析的严谨性与实用性的平衡。期望成长为资深数据科学家，用数据创造商业价值。',
    ex:[{c:'XX电子商务有限公司',t:'数据分析实习生',b:'2024.06',e:'2024.11',d:['S：公司某品类近3个月GMV持续下滑，运营团队无法定位原因，缺乏数据支撑决策。T：独立负责该品类全链路数据分析，找出GMV下滑根因并提出改善建议。A：使用SQL提取近6个月用户行为、订单、流量等10万+条数据，通过漏斗分析定位到加购→支付环节转化率异常下降，结合用户画像发现核心流失群体为三四线城市新用户，利用Tableau搭建品类监控看板。R：精准定位2个关键问题（支付页面加载慢 + 新用户优惠券过期bug），推动技术修复后该品类GMV环比增长35%，监控看板被推广至全品类使用。']}],
    ce:['计算机等级考试二级','大学英语四级（CET-4）','数据分析师认证（CDA）'],
    co:'统计学、数据库原理、Python程序设计、数据挖掘、机器学习、高等数学、线性代数'},
  '人工智能':{k:'AI/算法工程师',c:'互联网/科技',t:['Python','PyTorch','TensorFlow','机器学习','深度学习','NLP','计算机视觉','数据挖掘','Linux','CUDA','模型部署','特征工程'],
    s:['精通Python，熟练使用PyTorch/TensorFlow深度学习框架','掌握主流机器学习算法（随机森林、XGBoost、SVM等）原理与应用','理解CNN/RNN/Transformer等深度学习模型架构与训练调优','具备NLP/CV方向实战经验，熟悉预训练模型微调与部署','熟练使用Pandas/NumPy进行数据处理与特征工程','了解模型剪枝、量化、蒸馏等模型压缩技术'],
    se:'对人工智能技术充满热情，持续跟踪前沿论文与技术突破。具备扎实的数理基础与工程能力，善于将学术成果转化为工程实践。注重模型效率与效果平衡，追求技术创新与业务价值的统一。期望在AI领域深入发展，用算法解决真实世界的问题。',
    ex:[{c:'XX智能科技有限公司',t:'算法实习生',b:'2024.04',e:'2024.09',d:['S：客服团队承担日均3000+咨询量，人工处理效率低，重复性问题占70%。T：负责智能客服FAQ模型的选型、训练与部署。A：基于BERT预训练模型进行领域微调，构建50+意图分类体系，使用Faiss向量检索实现语义相似度匹配，设计主动学习策略持续优化标注效率，搭建Flask在线推理服务并容器化部署。R：智能客服自动解决率达72%，人工客服工作量减少55%，用户平均等待时间从3分钟降至20秒，模型推理延迟<50ms。']}],
    ce:['计算机等级考试二级','大学英语六级（CET-6）','深度学习工程师认证'],
    co:'机器学习、深度学习、数据结构与算法、Python程序设计、概率论与数理统计、线性代数'},

  // ===== 运营/市场类 =====
  '新媒体运营':{k:'新媒体运营专员',c:'互联网/传媒',t:['公众号运营','小红书运营','抖音运营','内容策划','数据分析','短视频制作','文案撰写','社群运营','用户增长','PS/Canva','135编辑器'],
    s:['精通微信公众号、小红书、抖音等主流平台运营规则与算法推荐机制','具备优秀的文案撰写能力，能独立策划并执行内容日历','熟练使用Canva/稿定设计等工具制作图文素材','掌握短视频脚本撰写与基础拍摄剪辑（剪映/PR）','善于通过数据分析（阅读量、完播率、转化率）优化内容策略','具备社群运营经验，能策划裂变活动提升粉丝增长与活跃度'],
    se:'热爱内容创作，对热点话题和用户情绪有敏锐洞察力。善于用简洁有力的文案打动用户，用数据驱动内容优化。具备从0到1的账号运营经验，能持续输出高传播力内容。对新媒体行业充满热情，期望成长为资深内容运营专家。',
    ex:[{c:'XX文化传媒有限公司',t:'新媒体运营实习生',b:'2024.03',e:'2024.08',d:['S：公司新号小红书账号起步3个月粉丝仅200，笔记平均点赞量不到10，账号处于冷启动状态。T：独立负责小红书账号内容策略制定与日常运营。A：分析100+同类爆款笔记，确定"职场干货+生活vlog"双内容线，每周稳定输出5篇高质量图文/视频，策划3场"简历模板免费领"裂变活动，通过评论区互动和粉丝群运营提升账号权重。R：5个月内粉丝从200增长至1.2万，产出12篇千赞爆款笔记，单篇最高阅读量15万+，通过账号为公众号导流3000+精准粉丝。']}],
    ce:['全媒体运营师','大学英语四级（CET-4）','计算机等级考试二级'],
    co:'新媒体概论、传播学、广告学、市场营销学、数字媒体技术、摄影摄像'},
  '电商运营':{k:'电商运营专员',c:'电商/零售',t:['淘宝运营','京东运营','拼多多运营','抖音电商','数据分析','选品策略','活动策划','直通车','SEO优化','转化率优化','供应链管理'],
    s:['熟悉淘宝/京东/拼多多等主流电商平台规则与搜索排名算法','掌握电商数据分析方法，能通过生意参谋/京东商智进行运营决策','熟悉直通车/万相台等推广工具的操作与ROI优化','具备选品与爆款打造的方法论，能通过竞品分析制定差异化策略','了解直播电商运营模式，有抖音/快手小店运营经验','熟练掌握Excel/ERP系统进行库存管理与销售预测'],
    se:'对电商行业有深刻理解，敏锐洞察消费趋势与用户心理。善于通过数据驱动运营决策，在选品、定价、推广各环节追求ROI最大化。具备全局思维，能从供应链到前端销售全链路思考问题。期望在电商运营领域持续深耕，成长为优秀的电商操盘手。',
    ex:[{c:'XX电子商务有限公司',t:'电商运营助理',b:'2024.04',e:'2024.09',d:['S：接手店铺某品类时月销售额仅5万元，转化率1.2%远低于行业均值2.5%，流量获取成本高。T：负责该品类店铺的整体运营策略优化与执行。A：重新定位目标人群并优化主图/详情页卖点，通过直通车精准人群投放+关键词优化降低点击成本，策划3场限时满减活动提升客单价，优化sku组合推荐提升连带率。R：6个月后品类月销售额从5万元提升至28万元（增长460%），转化率从1.2%升至2.8%超过行业均值，ROI从1.5优化至3.8，该品类进入店铺TOP3。']}],
    ce:['电子商务师','大学英语四级（CET-4）','计算机等级考试二级'],
    co:'电子商务概论、网络营销、供应链管理、市场营销学、数据分析与应用、消费者行为学'},
  '用户运营':{k:'用户运营专员',c:'互联网/科技',t:['用户增长','用户分层','用户画像','RFM模型','私域运营','社群运营','CRM','数据分析','A/B测试','活动策划','用户调研'],
    s:['熟悉用户生命周期管理（获客-激活-留存-转化-传播）全链路策略','掌握用户分层方法（RFM模型/用户画像），能制定差异化运营策略','善于通过数据分析定位用户增长瓶颈并制定针对性方案','具备私域流量运营经验，熟悉企业微信/社群/小程序运营','能独立策划并执行用户增长活动，对ROI负责','熟练使用神策/GrowingIO等用户行为分析工具'],
    se:'以用户为中心，对用户行为和需求有强烈好奇心。善于用数据量化用户价值，在增长和体验之间找到最优平衡点。具备创新思维和快速试错的能力，对用户增长的每个环节都有深入理解。期望在用户增长方向持续探索，成为驱动业务增长的核心力量。',
    ex:[{c:'XX在线教育科技有限公司',t:'用户运营实习生',b:'2024.05',e:'2024.10',d:['S：用户注册后7日留存率仅18%，远低于行业均值35%，拉新成本高但留存差，增长陷入瓶颈。T：负责新用户激活与留存策略的设计与执行。A：通过用户行为漏斗分析定位到注册→首次学习的流失关键节点，设计新用户7天引导任务体系（每日学习打卡+积分激励），使用RFM模型对用户分层推送个性化内容，搭建企业微信社群进行深度运营。R：7日留存率从18%提升至42%，月活用户增长65%，社群用户付费转化率达12%，用户LTV提升2.3倍。']}],
    ce:['计算机等级考试二级','大学英语四级（CET-4）'],
    co:'市场营销学、消费者行为学、统计学、管理学、心理学导论'},
  '市场营销':{k:'市场营销专员',c:'市场/广告',t:['市场调研','品牌策划','活动策划','营销推广','SEM/SEO','新媒体营销','竞品分析','营销数据分析','内容营销','KOL合作'],
    s:['具备市场调研与竞品分析能力，能独立输出行业洞察报告','熟悉线上线下整合营销玩法，有活动策划与执行全流程经验','掌握SEM/信息流广告投放优化技巧，能有效控制获客成本','了解品牌定位与传播策略，有品牌营销项目实战经验','善于内容营销策划，能协同KOL/KOC进行品牌传播','熟练使用Excel/SPSS进行营销数据复盘与ROI分析'],
    se:'对市场趋势和消费者洞察有天然的敏感度。善于用创意驱动增长，用数据验证效果。具备从策略到执行的全链路思考能力，在预算有限的情况下追求效果最大化。对品牌营销充满热情，期望成长为优秀的市场营销专家。',
    ex:[{c:'XX品牌营销策划有限公司',t:'市场营销实习生',b:'2024.03',e:'2024.08',d:['S：公司新消费品牌上市3个月，知名度低，月销量不足1000单，亟需打开市场。T：参与新品上市整合营销方案的策划与执行。A：通过200份问卷+10位目标用户深度访谈完成消费者洞察调研，策划"挑战30天打卡"小红书话题营销活动，筛选50位KOC进行产品种草，协同设计团队输出统一品牌视觉体系，监测各渠道数据实时优化投放策略。R：小红书话题曝光量300万+，品牌搜索量增长5倍，月销量从980单增长至8500单（增长767%），单品进入品类热销榜TOP10。']}],
    ce:['计算机等级考试二级','大学英语四级（CET-4）','营销策划师'],
    co:'市场营销学、消费者行为学、广告学、品牌管理、市场调研、统计学'},

  // ===== 职能/通用类 =====
  '人力资源':{k:'人力资源专员',c:'企业服务',t:['招聘管理','员工培训','绩效管理','薪酬福利','员工关系','HR系统','劳动法','面试技巧','人才盘点','组织发展'],
    s:['熟悉人力资源管理六大模块，掌握招聘全流程操作','熟练使用主流招聘渠道（BOSS直聘/猎聘/智联）进行人才寻访','具备简历筛选与面试技巧，能独立完成初试评估','了解薪酬核算与社保公积金操作流程','熟悉劳动合同法，能合规处理员工入离职','熟练使用钉钉/飞书/企业微信等办公协作平台'],
    se:'具备良好的亲和力与沟通能力，善于倾听与理解他人需求。做事严谨细致，注重流程规范与合规性。对人力资源管理充满热情，关注组织发展与人才成长。期望在人力资源领域持续深耕，成为既懂业务又懂人的优秀HRBP。',
    ex:[{c:'XX企业管理服务有限公司',t:'人力资源实习生',b:'2024.06',e:'2024.11',d:['S：公司业务快速扩张，技术团队3个月要招15人，历史招聘周期长达45天，严重影响项目进度。T：独立负责技术岗位的招聘全流程优化与执行。A：拓展招聘渠道（新增BOSS直聘/脉脉/Lagou），优化JD话术突出技术氛围与成长空间，建立结构化面试评估表统一面试标准，建立人才储备池持续跟进被动候选人，每周输出招聘数据报告复盘转化率。R：招聘周期从45天缩短至22天，累计筛选简历1200+份，成功入职18人（超额20%），招聘成本降低30%，建立的人才储备池为后续招聘节省50%时间。']}],
    ce:['企业人力资源管理师（三级）','计算机等级考试二级','大学英语四级（CET-4）'],
    co:'人力资源管理概论、组织行为学、劳动经济学、劳动法、薪酬管理、绩效管理'},
  '财务会计':{k:'财务会计',c:'金融/财务',t:['金蝶','用友','Excel','财务报表','会计核算','税务申报','成本控制','财务分析','审计','发票管理','会计准则'],
    s:['熟练使用金蝶/用友财务软件进行日常账务处理与报表编制','掌握企业会计准则，能独立完成月度/季度/年度账务核算','熟悉增值税/企业所得税等税种申报流程与最新税收政策','精通Excel财务函数应用（VLOOKUP/数据透视表/宏）','了解成本核算与费用管控方法，能进行基本财务分析','具备良好的财务合规意识与风险管控能力'],
    se:'对数字高度敏感，工作严谨细致，追求账务处理的零差错。具备扎实的财务专业知识，持续关注会计准则更新与税务政策变化。为人诚实守信、坚持原则，具备良好的职业道德。期望积累全盘账务经验，向管理会计/财务分析方向发展。',
    ex:[{c:'XX财务咨询有限公司',t:'会计助理',b:'2024.04',e:'2024.09',d:['S：公司代理记账客户从50家快速增长至80家，原有人工核对方式效率低，月度报表经常延迟2-3天。T：负责优化账务处理流程并协助完成月度税务申报。A：系统梳理30家新增客户的初始账务数据，设计Excel自动化模板（数据透视表+宏）实现报表半自动生成，建立客户资料电子化档案体系，协助处理30+家客户的增值税与企业所得税季度申报。R：月度报表出具时间从5天缩短至2天，申报准确率100%（零逾期/零罚款），客户续约率98%，因表现出色提前获得转正offer。']}],
    ce:['初级会计职称','计算机等级考试二级','大学英语四级（CET-4）'],
    co:'基础会计、中级财务会计、成本会计、税法、财务管理、审计学'},
  '行政助理':{k:'行政专员/助理',c:'企业服务',t:['办公软件','文档管理','会议组织','行政采购','费用报销','考勤管理','快递物流','固定资产管理','来访接待','公文写作'],
    s:['熟练使用Office办公软件，具备高效的文档处理与数据整理能力','具备良好的公文写作能力，熟悉会议纪要/通知/报告等行政文书规范','善于行政采购与供应商管理，能有效控制办公成本','熟悉企业固定资产管理与盘点流程','具备会议组织与活动策划执行经验','细心负责，能并行处理多项行政事务'],
    se:'做事认真细致、有条理，是团队信赖的"大管家"。具备优秀的执行力与服务意识，能将琐碎事务系统化高效处理。善于提前规划与风险预判，确保各项工作有序推进。沟通协调能力突出，与各部门保持良好协作关系。期望在行政领域持续成长，成为优秀的行政管理者。',
    ex:[{c:'XX企业管理咨询有限公司',t:'行政助理实习生',b:'2024.07',e:'2024.12',d:['S：公司搬迁至新办公室，原有固定资产台账缺失严重（盘点准确率仅60%），办公用品采购无统一管理导致浪费。T：负责公司固定资产全面盘点与行政采购体系搭建。A：逐一走访8个部门完成300+件固定资产清查与电子标签化管理，建立物品采购申请-审批-入库标准化流程，筛选3家办公用品供应商进行比价谈判，组织公司年度团建活动（80人规模）。R：固定资产盘点准确率从60%提升至98%，办公用品年采购成本降低25%（节省约5万元），团建活动满意度96%，行政制度被新员工手册收录。']}],
    ce:['计算机等级考试二级','大学英语四级（CET-4）','秘书职业资格证'],
    co:'管理学原理、行政管理学、档案管理学、公文写作、公共关系学'},

  // ===== 设计/创意类 =====
  'UI设计':{k:'UI/UX设计师',c:'互联网/科技',t:['Figma','Sketch','Adobe XD','Photoshop','Illustrator','用户研究','交互设计','设计系统','原型设计','可用性测试','设计规范'],
    s:['熟练使用Figma进行高保真UI设计与交互原型制作','具备UI设计规范搭建与组件库维护经验，能推动设计系统落地','掌握用户研究方法（用户访谈、可用性测试、A/B测试）','理解iOS Human Interface Guidelines与Material Design设计规范','熟练使用PS/AI进行图标与插画设计','了解HTML/CSS基础，能有效与前端开发协作'],
    se:'热爱设计，追求美学与功能的完美平衡。具备用户同理心，善于通过设计解决真实问题而非仅追求视觉美感。注重设计规范与交付质量，能系统化思考组件化设计。善于沟通设计方案，有效向非设计人员传达设计理念。期望成长为有影响力的全链路设计师。',
    ex:[{c:'XX科技有限公司',t:'UI设计实习生',b:'2024.05',e:'2024.10',d:['S：公司App设计风格陈旧，用户反馈界面混乱、操作路径长，竞品体验远超我们。T：参与App核心页面（首页/商品详情/个人中心）的UI改版设计。A：通过用户旅程地图梳理5个核心场景的体验痛点，设计3版视觉方案进行内部评审与A/B测试，搭建20+组件的设计组件库确保视觉一致性，输出完整的标注切图与设计规范文档。R：改版后用户首次任务完成率提升40%，关键页面转化率提升28%，用户满意度评分从3.2升至4.5，设计组件库使后续页面输出效率提升60%。']}],
    ce:['计算机等级考试二级','大学英语四级（CET-4）','Adobe认证设计师'],
    co:'人机交互、设计心理学、视觉传达设计、数字媒体技术、用户研究、色彩构成'},
  '平面设计':{k:'平面设计师',c:'广告/传媒',t:['Photoshop','Illustrator','InDesign','CorelDRAW','品牌设计','版式设计','印刷工艺','海报设计','包装设计','LOGO设计'],
    s:['精通Photoshop/Illustrator/InDesign等Adobe创意套件','具备扎实的版式设计与色彩搭配能力，能独立完成品牌视觉设计','了解印刷工艺与材质，能有效把控从设计到印刷的完整流程','有LOGO/VI/包装/海报等商业设计项目经验','善于与客户/需求方沟通，准确理解设计需求并高效落地','关注设计趋势，能持续为作品注入新鲜创意'],
    se:'对视觉设计充满热情，追求创意与商业目标的统一。能驾驭多种设计风格，不拘泥于单一表达形式。善于从品牌策略高度理解设计需求，提供超越期望的视觉解决方案。注重细节打磨，对出品质量有严格要求。期望在设计领域持续精进，成为有影响力的品牌设计师。',
    ex:[{c:'XX品牌设计工作室',t:'平面设计实习生',b:'2024.03',e:'2024.08',d:['S：工作室业务量增长，社交媒体视觉内容产出频率低（周更1次），品牌曝光不足。T：负责客户社交媒体视觉内容设计与工作室自有品牌建设。A：为5个客户品牌制定统一的社交视觉风格指南，每周稳定输出15+张高质量视觉内容（海报/信息图/封面），主导工作室LOGO升级与官网视觉改版。R：客户社交内容互动率平均提升65%，1个客户视觉内容获得行业设计奖，工作室官网咨询量增长120%，独立设计的品牌VI方案被3个客户采用。']}],
    ce:['计算机等级考试二级','大学英语四级（CET-4）','Adobe认证设计师'],
    co:'平面设计原理、色彩构成、版式设计、品牌设计、印刷工艺、设计史'},

  // ===== 销售/商务类 =====
  '销售':{k:'销售代表/客户经理',c:'不限',t:['客户开发','商务谈判','CRM系统','销售漏斗','合同管理','客户关系维护','市场拓展','方案演示','招投标','售后服务'],
    s:['具备优秀的客户开发与商务谈判能力，能独立开拓市场','熟悉销售漏斗管理，能系统化跟进商机并推动成交','善于维护客户关系，持续挖掘老客户二次合作机会','熟练使用CRM系统进行客户管理与销售数据分析','具备良好的方案演示与产品讲解能力','抗压能力强，能适应高频客户拜访与业绩目标'],
    se:'目标感强、行动力出众，以结果为导向。善于快速建立信任关系，准确把握客户需求痛点。在高压环境下保持积极心态，将挑战视为成长机会。对销售工作充满激情，期望在B2B/B2C销售领域持续突破，成为TOP Sales。',
    ex:[{c:'XX科技有限公司',t:'销售代表',b:'2024.04',e:'2024.09',d:['S：负责某三线城市市场区域，历史业绩低迷（季度仅30万），客户资源匮乏，渠道覆盖不足。T：负责该区域市场开拓与销售业绩提升。A：通过行业协会/展会/企查查等渠道获取200+潜在客户线索，建立客户分级管理体系（A/B/C类），坚持每日拜访5家+客户并详细记录跟进情况，针对不同客户类型定制产品方案演示。R：半年内累计签约新客户28家，季度销售额从30万提升至120万（增长300%），开发2个年框大客户（合同金额超50万/年），获公司"最佳新人奖"。']}],
    ce:['计算机等级考试二级','大学英语四级（CET-4）'],
    co:'市场营销学、商务谈判、消费者行为学、管理学、统计学'},

  // ===== 教育/培训类 =====
  '教师':{k:'教师/培训师',c:'教育',t:['课程设计','课堂教学','教学评估','PPT制作','学生管理','教案编写','教育心理学','班级管理','家长沟通'],
    s:['具备良好的语言表达与课堂组织能力，能有效管理班级秩序','熟悉教学设计方法（布鲁姆目标分类/加涅九段教学），能独立编写教案','掌握现代教育技术工具（智慧课堂/在线教育平台/微课制作）','了解青少年心理发展规律，善于因材施教','具备良好的家校沟通能力，能与家长建立信任关系','有爱心、有耐心，对教育事业充满热情'],
    se:'热爱教育事业，相信每个学生都有无限潜力。具备良好的亲和力与感染力，善于激发学生学习兴趣与内驱力。注重教学方法创新，持续探索更有效的教学策略。对学生认真负责，对教育保持敬畏之心。期望成长为优秀的骨干教师，用专业和爱心影响更多学生。',
    ex:[{c:'XX教育培训机构',t:'教师/助教',b:'2024.03',e:'2024.08',d:['S：接手班级学生成绩分化严重，班级平均分低于年级均分8分，后进生占比30%。T：负责该班级学科教学与后进生辅导方案制定。A：通过入学测试+学习风格评估为每位学生建立个性化学习档案，设计分层教学方案（基础巩固+能力提升+拓展拔尖），每日课后为后进生提供30分钟专项辅导，建立积分激励机制激发学习动力。R：班级平均分提升12分反超年级均分，后进生占比从30%降至8%，3名学生考入重点班，家长满意度从75%提升至96%。']}],
    ce:['普通话二级甲等','教师资格证','计算机等级考试二级','大学英语四级（CET-4）'],
    co:'教育学原理、教育心理学、课程与教学论、学科教学法、班级管理、现代教育技术'},

  // ===== 2026新增：AI/大模型 =====
  'AIGC':{k:'AIGC/大模型应用工程师',c:'互联网/AI',t:['Python','LangChain','Prompt Engineering','RAG','LLM Fine-tuning','Vector Database','Agent开发','API调用','HuggingFace','Embedding','Function Calling','Dify/Coze'],
    s:['精通Python，熟练使用LangChain/LlamaIndex等框架构建LLM应用','掌握Prompt Engineering方法论，能设计高效稳定的提示词模板','熟悉RAG架构，掌握向量数据库（Pinecone/Milvus/Chroma）的使用与优化','了解大模型微调技术（LoRA/QLoRA），具备模型部署与推理优化经验','能独立开发AI Agent应用，熟悉Function Calling与工具调用链设计','熟练使用Dify/Coze等低代码AI平台快速搭建原型与业务应用','了解多模态大模型（GPT-4V/Gemini）的API调用与图像理解场景应用'],
    se:'对AI技术充满热情，持续追踪大模型领域前沿进展。具备快速学习能力，能将最新的AI技术转化为解决实际业务问题的方案。注重Prompt质量与模型输出的可靠性，善于设计评估体系验证AI应用效果。期望在AGI浪潮中成长为AI应用架构师，用技术赋能千行百业。',
    ex:[{c:'XX智能科技有限公司',t:'AIGC应用实习生',b:'2024.06',e:'2024.12',d:['S：公司客服团队人工处理日均500+重复咨询，响应时间长、人力成本高。T：负责搭建基于大模型的智能客服知识库问答系统。A：使用LangChain+RAG架构搭建知识库检索系统，接入20+业务文档，设计多轮对话Prompt模板，通过语义分块+重排序优化检索准确率，集成Slack/飞书实现多平台部署。R：智能客服拦截率从0提升至65%，客服团队人力成本降低40%，用户满意度从3.2提升至4.1，月均可节省30万元外包客服成本。']}],
    ce:['计算机等级考试二级','大学英语四级（CET-4）','深度学习工程师认证'],
    co:'数据结构与算法、人工智能导论、自然语言处理、机器学习、Python程序设计、数据库原理'},

  // ===== 2026新增：跨境电商 =====
  '跨境电商':{k:'跨境电商运营专员',c:'电商/跨境',t:['TikTok运营','Shopee','Lazada','选品分析','Listing优化','Jungle Scout','红人营销','广告投流','供应链管理','物流跟踪','汇率风险管理','AI视频工具'],
    s:['熟练运营TikTok Shop/Shopee/Lazada等跨境平台，了解各市场规则与流量机制','掌握选品方法论，能使用Jungle Scout/Helium 10进行市场容量与竞争分析','擅长Listing优化与SEO，能撰写高转化英文产品标题与详情页','熟悉海外红人合作流程（达人筛选→建联→寄样→内容审核→效果复盘）','掌握TikTok Ads/Facebook Ads广告投放，能独立优化ROI','熟练使用AI视频工具（Runway/HeyGen）快速制作多语言产品视频','了解跨境物流（FBA/海外仓/直发）与跨境支付结算流程'],
    se:'对全球市场充满好奇心，善于发现不同地区的消费趋势与商业机会。数据驱动型运营思维，能通过数据分析指导选品与投放决策。具备跨文化沟通能力与英语实战能力，能独立对接海外达人与合作伙伴。期望在品牌出海的浪潮中成为跨境运营专家，帮助中国品牌走向世界。',
    ex:[{c:'XX跨境电子商务有限公司',t:'TikTok跨境电商实习生',b:'2024.04',e:'2024.09',d:['S：公司TikTok东南亚店铺日均GMV不足500美元，商品Listing转化率仅1.2%。T：负责TikTok Shop东南亚站（印尼/马来）的店铺运营与达人营销。A：通过Jungle Scout重新选品，优化10条核心Listing标题与主图视频，使用HeyGen制作本地语言产品介绍视频，建联30+本地达人合作带货，搭建TikTok Ads广告账户进行精准投流。R：日均GMV从500美元提升至3500美元（增长600%），Listing转化率从1.2%提升至3.8%，达人带货贡献GMV占比达45%，店铺评分从4.2提升至4.8。']}],
    ce:['大学英语六级（CET-6）','跨境电商运营师','电子商务师（三级）'],
    co:'国际贸易实务、电子商务概论、跨境电商运营、网络营销、商务英语、供应链管理'},

  // ===== 2026新增：直播运营 =====
  '直播运营':{k:'直播运营/直播带货',c:'电商/新媒体',t:['直播策划','直播间搭建','话术设计','选品排品','千川投流','巨量百应','直播数据分析','粉丝运营','主播管理','场景布置','复盘优化','OBS推流'],
    s:['熟悉抖音/快手/视频号直播规则与流量推荐机制','能独立完成直播策划：选品排品→话术撰写→场景搭建→流量投放→数据复盘','掌握千川/巨量引擎投流技巧，能根据直播节奏实时调整投放策略','擅长直播数据分析（在线人数/留存率/转化率/GPM），能快速定位问题','具备主播培训与管理能力，能帮助主播提升话术感染力与转化能力','了解OBS推流与虚拟直播间搭建技术','熟悉平台活动报名（618/双11/年货节），能制定大促直播方案'],
    se:'热爱直播电商行业，对流量与转化有敏锐的直觉。能抗压，适应直播高强度快节奏的工作特点。数据敏感度高，能从复盘数据中发现增长机会。善于沟通，能协调主播、运营、投放、供应链多方协作。期望在直播电商赛道持续深耕，成长为顶级直播运营操盘手。',
    ex:[{c:'XX直播电商有限公司',t:'直播运营实习生',b:'2024.05',e:'2024.10',d:['S：品牌自播间日均GMV仅2000元，场均观看人数不足200人，投产比0.6。T：负责品牌抖音自播间全面优化，从选品到投放全链路改造。A：重新选品并设计引流款+利润款+爆款的黄金排品结构，撰写分时段话术脚本，搭建场景化直播间（节日主题+产品使用场景），制定千川投流计划（开播前30分钟预热+直播中跑量抢量），每日复盘优化。R：日均GMV从2000元提升至3.5万元（增长1650%），场均观看突破5000人，投产比从0.6优化至2.8，月GMV突破100万元成为品牌标杆直播间。']}],
    ce:['电子商务师（三级）','互联网营销师','全媒体运营师'],
    co:'电子商务概论、网络营销、消费者心理学、数据化运营、新媒体概论、商务沟通'},

  // ===== 2026新增：数字营销/效果广告 =====
  '数字营销':{k:'数字营销/效果广告优化师',c:'广告/营销',t:['信息流广告','巨量引擎','千川','腾讯广告','SEM竞价','SEO优化','Google Ads','Facebook Ads','A/B测试','转化率优化','素材分析','归因分析'],
    s:['精通巨量引擎/千川/腾讯广告等主流信息流投放平台','能独立制定投放策略：人群定向→素材测试→出价策略→数据监控→优化迭代','掌握SEM竞价排名原理，能高效管理百度/Google搜索广告账户','熟悉A/B测试方法，能通过数据驱动素材与落地页优化','具备素材创意能力，能与设计/视频团队高效协作产出高转化素材','熟悉归因分析（Last Click/Linear/Data-Driven），能准确评估各渠道贡献','了解海外广告平台（Google Ads/Facebook Ads/TikTok Ads）投放基础'],
    se:'数据驱动型营销思维，相信每一个转化都可以被量化与优化。极强的逻辑分析能力，能从海量数据中快速定位问题并提出解决方案。善于与人协作，能高效对接创意、技术、销售团队推动增长。对ROI有极致追求，期望成为增长营销专家，用数据帮助企业实现品效合一。',
    ex:[{c:'XX数字营销有限公司',t:'信息流优化实习生',b:'2024.07',e:'2024.12',d:['S：客户App激活成本高达45元，远高于行业均值18元，月度预算100万跑不出量。T：负责客户App在抖音/腾讯双平台信息流广告全面优化。A：分析历史投放数据定位高转化人群画像，设计30+套创意素材进行A/B测试，重构账户结构（行为兴趣+lookalike定向），制定分时段分资源位出价策略，搭建实时数据监控看板异常预警。R：激活成本从45元降至15元（降幅67%），月消耗从100万提升至350万，次日留存率从18%提升至28%，客户续约金额翻3倍。']}],
    ce:['互联网营销师','Google Ads认证','巨量引擎认证优化师'],
    co:'市场营销学、网络营销、消费者行为学、统计学、广告学、电子商务'},

  // ===== 2026新增：嵌入式/芯片 =====
  '嵌入式':{k:'嵌入式/芯片设计工程师',c:'半导体/硬件',t:['C/C++','ARM架构','Linux驱动','RTOS','FPGA','Verilog/VHDL','PCB设计','MCU','I2C/SPI/UART','芯片验证','SystemVerilog','综合布局布线'],
    s:['精通C/C++编程，具备ARM Cortex-M/A系列MCU开发经验','熟悉Linux内核驱动开发与设备树配置，能独立完成BSP移植','掌握FreeRTOS/RT-Thread等实时操作系统原理与应用开发','熟悉I2C/SPI/UART/CAN等常用外设接口协议与驱动开发','了解FPGA开发流程，熟悉Verilog/VHDL硬件描述语言','掌握示波器/逻辑分析仪等调试工具，具备硬件Debug能力','了解芯片设计流程与UVM验证方法学，有EDA工具使用经验'],
    se:'对底层技术充满热情，喜欢刨根问底理解系统运行原理。具备扎实的计算机体系结构基础与硬件思维，能同时从软件和硬件角度分析问题。做事严谨细致，每一行代码都关系到硬件安全。期望在芯片国产化浪潮中成长为技术专家，为中国半导体事业贡献力量。',
    ex:[{c:'XX半导体科技有限公司',t:'嵌入式开发实习生',b:'2024.03',e:'2024.08',d:['S：公司IoT产品固件OTA升级失败率达8%，导致大量设备变砖需返厂维修。T：负责优化固件OTA升级方案与驱动稳定性提升。A：设计断点续传+回滚机制保障升级安全，优化Flash分区管理与擦写策略延长寿命，添加升级前环境校验（电量/网络/存储），完善升级日志与异常上报体系。R：OTA升级成功率从92%提升至99.7%，返厂维修率降至0.2%，节省售后成本约120万元/年，方案被推广至公司全部3条产品线。']}],
    ce:['计算机等级考试二级','大学英语四级（CET-4）','嵌入式系统工程师认证'],
    co:'数据结构与算法、计算机组成原理、操作系统、数字电路、嵌入式系统、信号与系统'},

  // ===== 通用兜底 =====
  '通用':{k:'专业人才',c:'不限',t:['Office办公套件','WPS办公软件','数据分析','沟通协调','项目管理','团队协作','文档撰写','PPT演示','信息检索','时间管理'],
    s:['熟练掌握Microsoft Office套件（Word、Excel、PowerPoint），能独立完成专业文档撰写与数据分析','精通WPS办公软件，具备高效的文档排版与数据处理能力','具备良好的信息检索与整合能力，能快速获取并整理所需资料','具备良好的书面与口头沟通能力，能清晰传达信息','善于团队协作，能在跨部门合作中有效推进工作','具备较强的学习能力与适应能力，能快速上手新工具新流程'],
    se:'具备良好的职业素养与工作习惯，做事认真负责、积极主动。学习能力强，能快速适应新环境和新挑战。善于在团队中发挥协作作用，为人踏实可靠。对职业发展有清晰规划，期望在专业领域持续深耕，为企业创造价值的同时实现个人成长。',
    ex:[{c:'XX科技有限公司',t:'实习生',b:'2024.06',e:'2024.09',d:['S：部门日常数据处理依赖手动操作，每次周报数据汇总需耗费4小时。T：负责优化部门数据整理流程并协助日常运营。A：利用Excel数据透视表+VLOOKUP搭建自动化数据汇总模板，将多个数据源整合为统一看板，协助完成月度运营数据报告与PPT汇报材料制作。R：周报数据汇总时间从4小时降至30分钟，月度报告按时交付率100%，制作的PPT获部门总监表扬并成为团队模板。']}],
    ce:['计算机等级考试二级（MS Office高级应用）','大学英语四级（CET-4）'],
    co:'管理学、经济学、统计学、市场营销学、财务管理'}
};

// 岗位关键词→profile匹配
function findJobProfile(title, major) {
  if (!title && !major) return JOB_PROFILES['通用'];
  var t=(title||'').toLowerCase(), m=(major||'').toLowerCase();
  // 按优先级匹配：精确匹配 > 关键词匹配 > major匹配 > 通用
  var keys=Object.keys(JOB_PROFILES);
  // Level 1: title精确包含profile key
  for (var i=0;i<keys.length;i++){
    if (t.indexOf(keys[i])!==-1 || keys[i].indexOf(t)!==-1) return JOB_PROFILES[keys[i]];
  }
  // Level 2: 扩展关键词匹配
  var extMap={
    '前端':['前端','web','网页','h5','vue','react','小程序','uniapp'],
    '后端':['后端','java','python','go','服务端','spring'],
    '测试':['测试','qa','质量','自动化'],
    '产品经理':['产品','pm','需求','原型','prd'],
    '数据分析':['数据','分析','bi','tableau','sql','统计','算法','机器学习'],
    '新媒体运营':['新媒体','公众号','小红书','抖音','内容','文案','短视频'],
    '电商运营':['电商','淘宝','京东','拼多多','店铺','天猫','跨境'],
    '用户运营':['用户运营','用户增长','私域','社群','会员','crm'],
    '市场营销':['市场','营销','品牌','广告','推广','渠道','sem','seo'],
    '人力资源':['人力','hr','招聘','人事','培训','薪酬'],
    '财务会计':['会计','财务','审计','出纳','税务','核算'],
    '行政助理':['行政','助理','文员','秘书','前台','后勤','综合'],
    'UI设计':['ui','ux','交互','视觉','界面'],
    '平面设计':['平面','品牌','海报','包装','vi','logo'],
    '销售':['销售','客户经理','商务','渠道','bd','业务'],
    '教师':['教师','老师','讲师','培训','教育','教务','辅导员'],
    'AIGC':['aigc','大模型','ai','llm','rag','langchain','prompt','agent','智能','深度学习','算法'],
    '跨境电商':['跨境','tiktok','shopee','lazada','海外','外贸','选品','亚马逊','独立站'],
    '直播运营':['直播','带货','主播','千川','直播间','巨量'],
    '数字营销':['信息流','广告投放','sem','竞价','优化师','投放','买量','增长'],
    '嵌入式':['嵌入式','芯片','iot','物联网','mcu','单片机','fpga','硬件','驱动','固件','半导体']
  };
  var extKeys=Object.keys(extMap);
  for (var i=0;i<extKeys.length;i++){
    var kw=extMap[extKeys[i]];
    for (var j=0;j<kw.length;j++){
      if (t.indexOf(kw[j])!==-1 || m.indexOf(kw[j])!==-1) return JOB_PROFILES[extKeys[i]];
    }
  }
  return JOB_PROFILES['通用'];
}

// ========== REFACTORED SMART FILL (job-title-driven) ==========
var SMART_FILL = {
  generateSkills: function(school, major, title) {
    var p=findJobProfile(title, major);
    return p.s||JOB_PROFILES['通用'].s;
  },
  generateSelfEval: function(name, school, major, title) {
    var p=findJobProfile(title, major);
    var base=p.se||JOB_PROFILES['通用'].se;
    // 将用户真实信息注入自我评价
    if(name&&base.indexOf('XXX')!==-1) base=base.replace('XXX',name);
    if(school&&base.indexOf('[学校]')!==-1) base=base.replace('[学校]',school);
    if(major&&base.indexOf('[专业]')!==-1) base=base.replace('[专业]',major);
    return base;
  },
  generateCampusExp: function(school, major, title) {
    var p=findJobProfile(title, major);
    var roleLabel=(p.k||'专业人才');
    var exps=[
      '项目组长 | '+(school||'学院')+roleLabel+'创新实践项目\n• S：课程设计项目中缺乏有效组织，团队协作效率低。T：主动担任项目组长，负责整体规划与任务分配。A：制定甘特图明确分工与时间节点，组织每周站会同步进度，协调组员解决技术难题。R：项目提前一周完成交付，获校级优秀项目展示，个人获"最佳组织奖"。',
      '学生会干事 | '+(school||'学院')+'学生会\n• S：校园文化节往届参与人数逐年下降，形式陈旧。T：参与策划执行新一届校园文化节，负责线上宣传与现场协调。A：设计系列预热H5+短视频在朋友圈/QQ空间传播，联络10+社团联合参与增加内容丰富度。R：活动参与人数同比增长60%，公众号涨粉2000+，获评"年度最佳校园活动"。',
      '志愿者领队 | '+(school||'大学')+'志愿者协会\n• S：社区老年人智能手机使用困难，数字化服务难以覆盖。T：组织策划"智慧助老"社区志愿服务项目。A：招募培训20名志愿者，设计4期智能手机培训课程（微信/支付/挂号/防诈骗），联系社区居委会安排场地与宣传。R：累计服务社区老人150+人次，项目获"优秀志愿服务项目"，志愿服务时长120+小时。'
    ];
    return exps[((school||'').length+(major||'').length)%exps.length];
  },
  generateExperience: function(school, major, title) {
    var p=findJobProfile(title, major);
    var exs=p.ex||JOB_PROFILES['通用'].ex;
    var out=[];
    for (var i=0;i<exs.length;i++){
      var descs=exs[i].d.map(function(d){
        // 将模版中的[学校][XX公司]/[学校]等占位符替换为用户真实信息
        return d.replace(/\[XX\]/g,'目标').replace(/\[学校\]|\[大学\]/g,school||'某高校')
          .replace(/\[专业\]/g,major||'相关');
      });
      out.push({company:exs[i].c, title:exs[i].t, start:exs[i].b, end:exs[i].e, descs:descs});
    }
    return out;
  },
  generateCerts: function(major, title) {
    var p=findJobProfile(title, major);
    return (p.ce||JOB_PROFILES['通用'].ce).slice();
  },
  generateLanguages: function(major) {
    var m=(major||'').toLowerCase();
    if(m.indexOf('英语')!==-1)return '普通话标准流利；英语专业四级（TEM-4），具备优秀的英语听说读写译能力';
    return '普通话标准流利，具备良好的语言表达能力；英语CET-4，具备基本的英语读写能力';
  },
  generateCourses: function(major, title) {
    var p=findJobProfile(title, major);
    return p.co||JOB_PROFILES['通用'].co;
  }
};

// ========== PARSE USER INPUT ==========
function parseUserInput(input) {
  var info={name:'',school:'',major:'',title:'',phone:'',email:'',location:'',degree:'本科'};
  var nm=input.match(/(?:我叫|我是|姓名[：:]\s*)([一-龥]{2,4})/i)||input.match(/^([一-龥]{2,4})$/m);
  if(nm)info.name=nm[1];
  // 清理名字后缀：毕业/同学/先生/女士 等非姓名词
  if(info.name){
    var nonNameSuffixes=['毕业','同学','先生','女士','朋友','老师','师傅','大哥','大姐','小弟','小姐','帅哥','美女','童鞋'];
    for(var si=0;si<nonNameSuffixes.length;si++){
      var sf=nonNameSuffixes[si];
      if(info.name.length>sf.length&&info.name.substring(info.name.length-sf.length)===sf){
        info.name=info.name.substring(0,info.name.length-sf.length);
        break;
      }
    }
    if(info.name.length<2||!/^[一-龥]{2,4}$/.test(info.name))info.name='';
  }
  var sm=input.match(/(?:毕业于?|学校[：:]\s*|院校[：:]\s*)([一-龥a-zA-Z()（）、]+?(?:大学|学院|学校|职业学院|职业技术学院))/i)||input.match(/([一-龥a-zA-Z()（）、]+?(?:大学|学院|学校|职业学院|职业技术学院))/);
  if(sm)info.school=sm[1];
  var mm=input.match(/(?:专业[：:]\s*|主修[：:]\s*)([一-龥a-zA-Z]{2,15}(?:专业|方向)?)/i);
  if(mm)info.major=mm[1].replace(/专业|方向/g,'');
  // 中文求职意向匹配（多层尝试）
  // 模式1: "想找XX的工作" / "想做XX方向"
  var tm=input.match(/(?:想找|想做)\s*([一-龥a-zA-Z+]{2,10}(?:工程师|经理|专员|助理|运营|设计|开发|分析|架构|师|员|代表|顾问|主播|投手|媒体|电商|市场|销售|客服|产品|教练|老师|讲师|导师|护士|医|医生|药剂|律师|会计|出纳|保安|导游|翻译|主持|经纪|策划|营养|健身|教练|剪辑|摄影|造价|监理|预算|施工|质检|安防|物流|采购|仓储|招商|督导|培训|招聘|人事|财务|审计|法务|秘书|助理|文员|前台|店长|厨师|美容|发型))\s*(?:的|方面|方向|岗位|职位|工作)?/i);
  // 模式2: "求职意向:XX" / "应聘XX" / "岗位:XX" — 不限后缀，捕捉完整岗位名
  if(!tm) tm=input.match(/(?:求职意向[：:]\s*|应聘[：:\s]*|岗位[：:]\s*|目标岗位[：:]\s*|意向岗位[：:]\s*)([一-龥a-zA-Z+、/]{2,20})/i);
  // 模式3: 英文 "looking for X position" / "seeking X role"
  if(!tm) tm=input.match(/(?:looking\s+for|seeking|applying\s+for|target(?:ing)?\s+)(?:a\s+|an\s+)?(.{3,40}?)\s*(?:position|role|job|方向|岗位|职位|工作|的)/i);
  // 模式4: "X方向" / "X岗位" / "X职位" / "X的工作"
  if(!tm) tm=input.match(/([一-龥a-zA-Z+]{2,15}(?:工程师|经理|专员|助理|运营|设计|开发|分析|架构|师|员|代表|顾问|教练|老师|讲师|导师|医生|律师|会计|翻译|主持|经纪|策划|剪辑|摄影|护士|药剂|秘书|助理|文员|导游|保安|监理|物流|采购|店长|厨师|美容))\s*(?:方向|岗位|职位|工作)/i);
  // 模式5: 英文 "X position/role/job" at end of line or before comma
  if(!tm) tm=input.match(/([A-Za-z\s&]{3,30}?)\s*(?:position|role|job)(?:\s|,|$)/i);
  if(tm)info.title=tm[1].trim();
  var pm=input.match(/(?:电话[：:]\s*|手机[：:]\s*)(1[3-9]\d{9})/)||input.match(/(?:^|[\s,，、])(1[3-9]\d{9})(?:$|[\s,，、])/);
  if(pm)info.phone=pm[1];
  var em=input.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if(em)info.email=em[1];
  var lm=input.match(/(?:住址[：:]\s*|地址[：:]\s*|在\s*)([一-龥]{2,10}(?:市|省|区|县|杭州|北京|上海|广州|深圳|成都|武汉|南京|西安|重庆|南昌))/);
  if(lm)info.location=lm[1];
  if(/本科/.test(input))info.degree='本科';if(/硕士|研究生/.test(input))info.degree='硕士';
  if(/博士/.test(input))info.degree='博士';if(/大专|专科/.test(input))info.degree='大专';
  // Try harder for name
  if(!info.name&&input.trim()){
    var lines=input.trim().split(/[\n,，、]/);
    for(var i=0;i<lines.length;i++){var t=lines[i].trim();if(/^[一-龥]{2,4}$/.test(t)&&!/[大学学院省市县区]/.test(t)){info.name=t;break;}}
  }
  return info;
}

// ========== DEEPSEEK RESUME GENERATION (HR-GRADE) ==========
// 基于HR筛选标准 + ATS系统要求 + 高分简历方法论
// 核心原则：动词有力、数据加粗、STAR完整、技能分类、一页原则、ATS友好
function generateResumeWithDeepSeek(userInput, callback) {
  var info = parseUserInput(userInput);
  var targetTitle = info.title || '';
  var prompt = '你是资深HR总监兼简历顾问。请根据以下用户信息，生成一份专业的简历JSON。\n\n'+
    '【用户信息】\n'+
    '姓名：'+(info.name||'未提供')+'\n'+
    '学校：'+(info.school||'未提供')+'\n'+
    '专业：'+(info.major||'未提供')+'\n'+
    '学历：'+(info.degree||'大专')+'\n'+
    '求职意向：'+(targetTitle||'请根据专业和兴趣推断最匹配的岗位方向')+'\n'+
    '手机：'+(info.phone||'未提供（留空）')+'\n'+
    '邮箱：'+(info.email||'未提供（留空）')+'\n'+
    '地点：'+(info.location||'未提供')+'\n\n'+
    '【核心原则 — 严格遵守】\n'+
    '1. 严禁编造用户未提供的数据：手机号/邮箱/公司名/项目名/具体数字，没有就留空或标注"待补充"\n'+
    '2. 量化数据只能基于用户输入中已有的信息推断，不能凭空生成。原文有数据则突出展示\n'+
    '3. 经历描述用STAR法则：强势动词开头 + 具体方法 + 真实成果。禁用"负责""参与"开头\n'+
    '4. 删除"学习能力强""吃苦耐劳""性格开朗"等无效虚词，用具体事例证明能力\n'+
    '5. 技能按3-4个大类组织（如"编程开发""办公协作""设计工具""语言能力"），每个类别2-4个具体技能+使用场景\n'+
    '6. 校园经历也要用STAR改写，不写"锻炼了能力"这种虚话\n'+
    '7. 技能要贴近大学生真实水平：Excel基础函数与数据透视、PPT汇报制作、剪映剪辑、Canva作图、飞书/钉钉协作等基础技能要体现\n'+
    '8. 不要重复同一类别标签（如不要同时出现"工具"和"平台工具"两个类），大类合并\n\n'+
    '【大学生常见技能参考 — 根据求职方向选用，仅作启发不要照抄】\n'+
    '▸ 通用基础：Office套件（Excel数据整理与透视表/PPT制作/Word排版）、飞书/钉钉协作\n'+
    '▸ 设计方向：Canva海报设计、剪映/CapCut短视频剪辑、Figma基础界面\n'+
    '▸ 编程方向：Python基础、HTML/CSS、Git版本管理、SQL查询\n'+
    '▸ 新媒体方向：公众号排版与文案、抖音/小红书内容运营、短视频脚本策划\n'+
    '▸ 数据方向：Excel数据透视表、Python数据分析、Tableau/Power BI基础\n'+
    '▸ 语言方向：英语CET-4/6（日常商务邮件读写）、普通话二甲\n\n'+
    '【skills字段格式示例】\n'+
    '  "skills": [\n'+
    '    "编程开发 - 熟练使用Python进行数据清洗与自动化脚本编写，了解Pandas/NumPy基础",\n'+
    '    "办公协作 - 精通Excel数据透视表与VLOOKUP函数，使用飞书/钉钉进行团队协作与项目管理",\n'+
    '    "设计工具 - 使用Canva制作海报/宣传物料，剪映进行短视频剪辑与字幕添加",\n'+
    '    "语言能力 - 英语CET-6，能进行日常商务邮件读写与基础口语交流"\n'+
    '  ]\n\n'+
    '返回纯JSON（无markdown标记，不要任何解释文字）：\n'+
    '{\n'+
    '  "title": "精确岗位名（如：前端开发工程师 / 新媒体内容运营, 不要大类如"互联网"）",\n'+
    '  "phone": "'+(info.phone||'')+'（只返回用户提供的真实号码，没有就留空字符串）",\n'+
    '  "email": "'+(info.email||'')+'（只返回用户提供的真实邮箱，没有就留空字符串）",\n'+
    '  "location": "'+(info.location||'')+'（只返回用户提供的真实城市，没有就基于学校推断，再没有就留空字符串）",\n'+
    '  "selfEval": "基于用户真实背景提炼2-3个核心能力，每个=能力+事例+价值。150-200字。不要编造经历。不要出现"学习能力强""吃苦耐劳"等虚词。",\n'+
    '  "skills": [/* 4-8项, 格式严格为"类别名 - 技能描述与使用场景" */],\n'+
    '  "majorCourses": "6-8门相关课程,逗号分隔（基于专业合理推断，用户未提供专业则留空字符串）",\n'+
    '  "certs": ["证书名",...0-4个,没有就空数组],\n'+
    '  "languages": "语言能力描述+应用场景。如未提供就留空字符串",\n'+
    '  "campusExp": "岗位 | 组织\\n• 强势动词+方法+成果（每条用STAR逻辑，不编造数据。没有就空字符串）",\n'+
    '  "experiences": [{\n'+
    '    "company": "公司名（如果用户没提供具体公司名，就用[XX公司]占位）",\n'+
    '    "title": "业务岗位名（不是"实习生"而是"前端开发实习生"这种具体叫法）",\n'+
    '    "start": "2024.06",\n'+
    '    "end": "2025.03",\n'+
    '    "descs": [\n'+
    '      "每条用自然段落描述：强势动词+具体方法+真实成果。不要加STAR字母标签。不要编造数据。至少3条。",\n'+
    '      ...\n'+
    '    ]\n'+
    '  }]\n'+
    '}';

  callDeepSeek(prompt, function(err, text) {
    if (err || !text) {
      var apiErr = err ? (err.message || err.toString()) : '无返回内容';
      console.log('DeepSeek API failed, using local fallback:', apiErr);
      showToast('AI服务暂时不可用(' + apiErr.substring(0, 30) + ')，已使用本地引擎生成','success');
      callback(generateLocalResumeData(userInput));
      return;
    }
    try {
      var jsonStr = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
      var aiData = JSON.parse(jsonStr);
      // 兼容旧格式：skills可能是扁平数组或分类数组
      var skills = aiData.skills || [];
      var info2 = parseUserInput(userInput);
      var resumeData = {
        name: info2.name || '未填写',
        title: aiData.title || info2.title || '求职者',
        phone: aiData.phone || info2.phone || '', email: aiData.email || info2.email || '', location: aiData.location || info2.location || '',
        school: info2.school || '', major: info2.major || '', degree: info2.degree || '本科',
        eduStart: '2021.09', eduEnd: '2025.06',
        selfEval: aiData.selfEval || '',
        skills: skills,
        majorCourses: aiData.majorCourses || '',
        certs: aiData.certs || [],
        languages: aiData.languages || '',
        campusExp: aiData.campusExp || '',
        experiences: aiData.experiences || []
      };
      callback(resumeData);
    } catch(e) {
      console.log('JSON parse failed, using local fallback:', e);
      callback(generateLocalResumeData(userInput));
    }
  }, 'pro');
}

// ========== LOCAL RESUME GENERATION (FALLBACK) ==========
function generateLocalResumeData(userInput) {
  var info = parseUserInput(userInput);
  var school=info.school||'',major=info.major||'',title=info.title||(major?major+'相关岗位':''),name=info.name||'';
  if(!info.title){
    // 尝试从输入中推断岗位
    var tInput=userInput.toLowerCase();
    if(/前端|web|网页/.test(tInput))title='前端开发工程师';
    else if(/后端|java|python|服务端/.test(tInput))title='后端开发工程师';
    else if(/测试|qa/.test(tInput))title='软件测试工程师';
    else if(/产品|pm|需求/.test(tInput))title='产品经理/助理';
    else if(/数据|分析|bi|tableau/.test(tInput))title='数据分析师';
    else if(/新媒体|公众号|小红书|抖音|内容|文案/.test(tInput))title='新媒体运营';
    else if(/电商|淘宝|京东|拼多多|店铺/.test(tInput))title='电商运营';
    else if(/运营/.test(tInput))title='用户运营';
    else if(/市场|营销|品牌|广告|推广/.test(tInput))title='市场营销专员';
    else if(/人力|hr|招聘|人事/.test(tInput))title='人力资源专员';
    else if(/会计|财务|审计|出纳/.test(tInput))title='财务会计';
    else if(/行政|助理|文员|秘书/.test(tInput))title='行政专员/助理';
    else if(/ui|ux|设计|视觉/.test(tInput))title='UI/UX设计师';
    else if(/销售|客户经理|商务/.test(tInput))title='销售代表';
    else if(/教师|老师|培训|教育/.test(tInput))title='教师/培训师';
    else title='通用';
  }
  // 用title匹配最合适的岗位profile
  var profile=findJobProfile(title, major);
  if (profile===JOB_PROFILES['通用'] && info.title) title=info.title; // 保持用户原始输入
  else if (profile!==JOB_PROFILES['通用']) title=profile.k; // 使用profile规范名称

  return {
    name:name||'未填写', title:title||'求职者',
    phone:info.phone||'',email:info.email||'',location:info.location||'',
    school:school,major:major,degree:info.degree||'本科',
    eduStart:'2021.09',eduEnd:'2025.06',
    selfEval:SMART_FILL.generateSelfEval(name,school,major,title),
    skills:SMART_FILL.generateSkills(school,major,title),
    majorCourses:SMART_FILL.generateCourses(major,title),
    certs:SMART_FILL.generateCerts(major,title),
    languages:SMART_FILL.generateLanguages(major),
    campusExp:SMART_FILL.generateCampusExp(school,major,title),
    experiences:SMART_FILL.generateExperience(school,major,title)
  };
}

// ========== RESUME GENERATOR ==========
function initGenerator() {
  var s=state.generator;
  s.step=1;document.getElementById('gen-free-input').value='';
  document.getElementById('gen-mode-radio-free').checked=true;switchGenMode('free');
  s.experiences=[{company:'',title:'',start:'',end:'',descs:['','','']}];
  s.skills=[];s.certs=[];
  renderExperienceList();renderSkillsList();renderCertsList();
  updateTemplateSelector();updateGeneratorSteps(1);
  s.initialized=true;
}

function switchGenMode(mode) {
  state.generator.mode=mode;
  document.getElementById('gen-mode-free').style.display=mode==='free'?'block':'none';
  document.getElementById('gen-mode-guided').style.display=mode==='guided'?'block':'none';
  document.getElementById('mode-opt-free').classList.toggle('selected',mode==='free');
  document.getElementById('mode-opt-guided').classList.toggle('selected',mode==='guided');
  document.getElementById('gen-mode-radio-free').checked=(mode==='free');
  document.getElementById('gen-mode-radio-guided').checked=(mode==='guided');
  // 切换模式时重置到步骤1，确保不会出现旧预览和新输入卡同时显示
  state.generator.step = 1;
  updateGeneratorSteps(1);
}

function handleFreeInput() {
  var input=document.getElementById('gen-free-input').value.trim();
  if(!input||input.length<2){showToast('请至少填写姓名或学校信息','error');return;}

  var info = parseUserInput(input);

  // 缺少求职意向 → 引导去职业规划师
  if (!info.title) {
    showJobTargetGuidance(input, info);
    return;
  }

  var btn=document.getElementById('gen-free-btn');
  var origHTML=btn.innerHTML;
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> 生成中...';

  var freeCard = document.getElementById('gen-mode-free');
  var loadingEl = document.getElementById('gen-loading');
  if (!loadingEl) {
    loadingEl = document.createElement('div');
    loadingEl.id = 'gen-loading';
    loadingEl.className = 'card';
    loadingEl.style.padding = '32px';
    loadingEl.style.marginTop = '20px';
    loadingEl.innerHTML =
      '<div class="gen-progress">'+
        '<div class="gen-progress-steps">'+
          '<div class="gen-progress-step active" data-step="1"><div class="gen-progress-dot"></div><span>分析背景</span></div>'+
          '<div class="gen-progress-line"></div>'+
          '<div class="gen-progress-step" data-step="2"><div class="gen-progress-dot"></div><span>匹配岗位</span></div>'+
          '<div class="gen-progress-line"></div>'+
          '<div class="gen-progress-step" data-step="3"><div class="gen-progress-dot"></div><span>生成内容</span></div>'+
          '<div class="gen-progress-line"></div>'+
          '<div class="gen-progress-step" data-step="4"><div class="gen-progress-dot"></div><span>排版预览</span></div>'+
        '</div>'+
        '<div class="gen-progress-bar"><div class="gen-progress-fill"></div></div>'+
        '<div class="gen-progress-text">正在分析你的背景信息...</div>'+
      '</div>'+
      '<div class="skeleton-card" style="margin-top:20px"></div>'+
      '<div class="skeleton-line"></div>'+
      '<div class="skeleton-line" style="width:70%"></div>';
    freeCard.parentNode.insertBefore(loadingEl, freeCard.nextSibling);
    loadingEl.scrollIntoView({behavior:'smooth'});
    // 模拟进度动画
    var steps = loadingEl.querySelectorAll('.gen-progress-step');
    var bar = loadingEl.querySelector('.gen-progress-fill');
    var text = loadingEl.querySelector('.gen-progress-text');
    var stepTexts = ['正在分析你的背景信息...', '正在匹配最适合的岗位模板...', '正在生成专业简历内容...', '正在排版美化...'];
    var stepIdx = 0;
    var progressTimer = setInterval(function() {
      stepIdx++;
      if (stepIdx >= 4) { clearInterval(progressTimer); return; }
      steps[stepIdx].classList.add('active');
      bar.style.width = ((stepIdx+1)*25) + '%';
      text.textContent = stepTexts[stepIdx];
    }, 1500);
    loadingEl._progressTimer = progressTimer;
  }

  showToast('正在智能生成简历，请稍候...','success');

  generateResumeWithDeepSeek(input, function(resumeData) {
    var ld = document.getElementById('gen-loading');
    if (ld) { if (ld._progressTimer) clearInterval(ld._progressTimer); ld.remove(); }
    Object.assign(state.generator, resumeData);
    state.generator.step=5;state.generator.initialized=true;
    updateGeneratorSteps(5);
    renderGeneratedResume();
    renderStep5EditBar();
    document.getElementById('gen-step-5').scrollIntoView({behavior:'smooth'});
    btn.disabled=false;btn.innerHTML=origHTML;
    showToast('简历生成完成！点击内容可直接编辑');
  });
}

// ========== MISSING JOB TARGET GUIDANCE ==========
var _genPendingInput = '';

function showJobTargetGuidance(input, info) {
  dismissJobTargetGuidance();
  var freeCard = document.getElementById('gen-mode-free');
  var guidanceEl = document.createElement('div');
  guidanceEl.id = 'gen-job-guidance';
  guidanceEl.className = 'card';
  guidanceEl.style.cssText = 'margin-top:20px;border-left:4px solid #4E7282;';

  var hasName = info.name ? '已识别：'+escHtml(info.name) : '未识别姓名';
  var hasSchool = info.school ? '已识别：'+escHtml(info.school) : '未识别学校';

  guidanceEl.innerHTML =
    '<div style="display:flex;align-items:flex-start;gap:16px">'+
      '<div style="font-size:32px;flex-shrink:0">&#x2728;</div>'+
      '<div style="flex:1">'+
        '<h3 style="margin:0 0 8px;color:#4E7282">尚未明确求职意向</h3>'+
        '<p style="margin:0 0 12px;color:#666;line-height:1.6">为了让生成的简历<strong>精准匹配</strong>目标岗位，建议先与职业规划师聊聊。只需1-2分钟回答几个简单问题，就能明确最适合你的职业方向。</p>'+
        '<div style="background:#f8f9fa;border-radius:8px;padding:12px 16px;margin-bottom:16px">'+
          '<div style="font-size:13px;color:#888;margin-bottom:6px">已提取的信息：</div>'+
          '<div style="font-size:13px;color:#333">'+hasName+'</div>'+
          (hasSchool ? '<div style="font-size:13px;color:#333">'+hasSchool+'</div>' : '')+
          '<div style="font-size:13px;color:#e67e22">求职意向：未填写</div>'+
        '</div>'+
        '<div style="display:flex;gap:12px;flex-wrap:wrap">'+
          '<button class="btn btn-primary btn-lg" onclick="goToCareerFromGenerator()" style="white-space:nowrap">与职业规划师聊聊</button>'+
          '<button class="btn btn-ghost" onclick="skipJobTargetGuidance()">跳过，随机生成</button>'+
        '</div>'+
        '<p style="margin:12px 0 0;font-size:12px;color:#aaa">职业规划师会通过对话了解你的性格、兴趣和偏好，推荐最适合的岗位方向，确定后自动回到这里生成简历。</p>'+
      '</div>'+
    '</div>';

  freeCard.parentNode.insertBefore(guidanceEl, freeCard.nextSibling);
  guidanceEl.scrollIntoView({behavior:'smooth'});
  _genPendingInput = input;
}

function dismissJobTargetGuidance() {
  var el = document.getElementById('gen-job-guidance');
  if (el) el.remove();
}

function goToCareerFromGenerator() {
  _genPendingInput = document.getElementById('gen-free-input').value.trim();
  careerState.fromGenerator = true;
  careerState.generatorInput = _genPendingInput;
  switchSection('career');
  document.getElementById('sec-career').scrollIntoView({behavior:'smooth'});
  careerState.messages = [];
  careerState.profile = null;
  careerState.suggestedTitle = '';
  careerState.suggestedField = '';
  document.getElementById('career-chat-messages').innerHTML = '';
  document.getElementById('career-result-action').style.display = 'none';
  document.getElementById('career-quick-actions').style.display = 'block';

  var info = parseUserInput(_genPendingInput);
  var greeting = '你好！我是职业规划师小职 \n\n我注意到你';
  if (info.name) greeting += '（'+info.name+'）';
  if (info.school) greeting += ' 正在准备简历，毕业于'+info.school;
  greeting += '，但还没确定具体的求职方向。\n\n别担心，让我来帮你理清思路！我会问你几个简单问题：\n\n- 性格特点 — 你觉得自己是内向还是外向？做事更偏向细心还是果断？\n- 兴趣爱好 — 平时喜欢做什么？对什么领域比较感兴趣？\n- 职业偏好 — 有没有特别想尝试的行业或岗位？\n\n先和我聊聊吧，我会根据你的情况推荐最适合的方向 ';

  addChatMessage('bot', greeting);
  careerState.messages.push({ role: 'assistant', content: greeting });
}

function skipJobTargetGuidance() {
  dismissJobTargetGuidance();
  var input = document.getElementById('gen-free-input').value.trim() || _genPendingInput;
  _genPendingInput = '';
  var btn = document.querySelector('#gen-mode-free button');
  var origHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 生成中...';
  showToast('未指定求职方向，AI将根据背景推断','info');
  // 继续正常生成流程（复用已有逻辑）
  var freeCard = document.getElementById('gen-mode-free');
  var loadingEl = document.getElementById('gen-loading');
  if (!loadingEl) {
    loadingEl = document.createElement('div');
    loadingEl.id = 'gen-loading';
    loadingEl.className = 'card';
    loadingEl.style.padding = '32px';
    loadingEl.style.marginTop = '20px';
    loadingEl.innerHTML =
      '<div class="gen-progress">'+
        '<div class="gen-progress-steps">'+
          '<div class="gen-progress-step active" data-step="1"><div class="gen-progress-dot"></div><span>分析背景</span></div>'+
          '<div class="gen-progress-line"></div>'+
          '<div class="gen-progress-step" data-step="2"><div class="gen-progress-dot"></div><span>匹配岗位</span></div>'+
          '<div class="gen-progress-line"></div>'+
          '<div class="gen-progress-step" data-step="3"><div class="gen-progress-dot"></div><span>生成内容</span></div>'+
          '<div class="gen-progress-line"></div>'+
          '<div class="gen-progress-step" data-step="4"><div class="gen-progress-dot"></div><span>排版预览</span></div>'+
        '</div>'+
        '<div class="gen-progress-bar"><div class="gen-progress-fill"></div></div>'+
        '<div class="gen-progress-text">正在分析你的背景信息...</div>'+
      '</div>'+
      '<div class="skeleton-card" style="margin-top:20px"></div>'+
      '<div class="skeleton-line"></div>'+
      '<div class="skeleton-line" style="width:70%"></div>';
    freeCard.parentNode.insertBefore(loadingEl, freeCard.nextSibling);
    loadingEl.scrollIntoView({behavior:'smooth'});
    var steps = loadingEl.querySelectorAll('.gen-progress-step');
    var bar = loadingEl.querySelector('.gen-progress-fill');
    var text = loadingEl.querySelector('.gen-progress-text');
    var stepTexts = ['正在分析你的背景信息...', '正在匹配最适合的岗位模板...', '正在生成专业简历内容...', '正在排版美化...'];
    var stepIdx = 0;
    var progressTimer = setInterval(function() {
      stepIdx++;
      if (stepIdx >= 4) { clearInterval(progressTimer); return; }
      steps[stepIdx].classList.add('active');
      bar.style.width = ((stepIdx+1)*25) + '%';
      text.textContent = stepTexts[stepIdx];
    }, 1500);
    loadingEl._progressTimer = progressTimer;
  }

  generateResumeWithDeepSeek(input, function(resumeData) {
    var ld = document.getElementById('gen-loading');
    if (ld) { if (ld._progressTimer) clearInterval(ld._progressTimer); ld.remove(); }
    Object.assign(state.generator, resumeData);
    state.generator.step = 5;
    state.generator.initialized = true;
    updateGeneratorSteps(5);
    renderGeneratedResume();
    document.getElementById('gen-step-5').scrollIntoView({behavior:'smooth'});
    btn.disabled = false;
    btn.innerHTML = origHTML;
    showToast('简历生成完成！建议下次先确定求职方向再生成，效果会更好');
  });
}

function updateGeneratorSteps(step) {
  state.generator.step=step;
  document.querySelectorAll('#gen-steps .step').forEach(function(el,i){
    el.classList.remove('active','completed');
    if(i+1===step)el.classList.add('active');
    if(i+1<step)el.classList.add('completed');
  });
  document.querySelectorAll('.gen-step-content').forEach(function(el,i){
    el.style.display=(i+1===step)?'block':'none';
  });
}

function generatorNext(step) {
  saveStepData(step);
  if(step===1&&state.generator.mode==='guided'){
    if(!document.getElementById('gen-name').value.trim()||!document.getElementById('gen-title').value.trim()){
      showToast('请填写姓名和求职意向','error');return;
    }
  }
  if(step<5){updateGeneratorSteps(step+1);if(step+1===5){renderGeneratedResume();renderStep5EditBar();}document.getElementById('gen-step-'+(step+1)).scrollIntoView({behavior:'smooth'});}
}
function generatorPrev(step){if(step>1){updateGeneratorSteps(step-1);document.getElementById('gen-step-'+(step-1)).scrollIntoView({behavior:'smooth'});}}

// Step nav click → jump to that step
function jumpToStep(step){
  if(!state.generator.initialized) return;
  if(step<5) saveStepData(state.generator.step);
  updateGeneratorSteps(step);
  if(step===5){renderGeneratedResume();renderStep5EditBar();}
  document.getElementById('gen-step-'+step).scrollIntoView({behavior:'smooth'});
}

function saveStepData(step) {
  var g=state.generator;
  if(step===1){
    g.name=document.getElementById('gen-name').value.trim();g.title=document.getElementById('gen-title').value.trim();
    g.phone=document.getElementById('gen-phone').value.trim();g.email=document.getElementById('gen-email').value.trim();
    g.location=document.getElementById('gen-location').value.trim();
  }
  if(step===2){
    g.school=document.getElementById('gen-school').value.trim();g.major=document.getElementById('gen-major').value.trim();
    g.degree=document.getElementById('gen-degree').value||'本科';
    g.eduStart=document.getElementById('gen-edustart').value.trim();g.eduEnd=document.getElementById('gen-eduend').value.trim();
    g.majorCourses=document.getElementById('gen-majorcourses').value.trim();
  }
  if(step===3){saveExperienceData();g.selfEval=document.getElementById('gen-selfeval').value.trim();}
  if(step===4){g.languages=document.getElementById('gen-languages').value.trim();g.campusExp=document.getElementById('gen-campusexp').value.trim();}
}

// Experience CRUD
function renderExperienceList(){
  var c=document.getElementById('exp-list'),h='';
  state.generator.experiences.forEach(function(exp,i){
    h+='<div class="card" style="padding:16px;margin-bottom:8px"><div class="flex-between mb-16"><span class="font-bold text-sm">经历 #'+(i+1)+'</span><button class="btn btn-ghost btn-sm" onclick="removeExperience('+i+')">删除</button></div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'+
    '<div class="form-group"><label class="form-label">公司/组织</label><input class="form-input exp-company" data-idx="'+i+'" value="'+escHtml(exp.company||'')+'" placeholder="XX公司"></div>'+
    '<div class="form-group"><label class="form-label">职位</label><input class="form-input exp-title" data-idx="'+i+'" value="'+escHtml(exp.title||'')+'" placeholder="职位名称"></div>'+
    '<div class="form-group"><label class="form-label">开始</label><input class="form-input exp-start" data-idx="'+i+'" value="'+escHtml(exp.start||'')+'" placeholder="2024.06"></div>'+
    '<div class="form-group"><label class="form-label">结束</label><input class="form-input exp-end" data-idx="'+i+'" value="'+escHtml(exp.end||'')+'" placeholder="2024.09"></div></div>'+
    '<div class="form-group mt-8"><label class="form-label">工作描述</label>';
    (exp.descs||['']).forEach(function(d,j){
      h+='<div class="flex gap-8" style="margin-bottom:4px"><input class="form-input exp-desc" data-idx="'+i+'" data-didx="'+j+'" value="'+escHtml(d||'')+'" placeholder="描述工作内容..."><button class="btn btn-ghost btn-sm" onclick="removeExpDesc('+i+','+j+')">x</button></div>';
    });
    h+='<div class="flex gap-8 mt-8"><button class="btn btn-outline btn-sm" onclick="addExpDesc('+i+')">+ 添加描述</button><button class="btn btn-primary btn-sm" onclick="aiEnhanceExperience('+i+')">AI 优化</button></div></div></div>';
  });
  c.innerHTML=h;
}
function aiEnhanceExperience(i){
  var exp=state.generator.experiences[i];
  if(!exp||!exp.descs||!exp.descs.join('').trim()){showToast('请先填写工作描述再使用AI优化','warning');return;}
  showToast('AI优化中...','info');
  var prompt='请用STAR法则（情境Situation、任务Task、行动Action、结果Result）优化以下工作经历描述，使其更具专业性和数据说服力。保持中文输出，每一条优化为一段。\n\n公司：'+exp.company+'\n职位：'+exp.title+'\n原始描述：\n'+exp.descs.map(function(d,j){return (j+1)+'. '+d;}).join('\n')+'\n\n请直接返回优化后的描述，用数字列表编号，不要额外解释。';
  callDeepSeek(prompt, function(err, text){
    if(err||!text){showToast('AI优化失败，请稍后重试','error');return;}
    var lines=text.split('\n').filter(function(l){return l.trim()&&/^\d+[\.\、]/.test(l.trim());}).map(function(l){return l.replace(/^\d+[\.\、]\s*/,'').trim();});
    if(lines.length===0) lines=text.split('\n').filter(function(l){return l.trim().length>5;});
    if(lines.length>0) exp.descs=lines;
    renderExperienceList();
    showToast('AI优化完成！','success');
  },'flash');
}
function addExperience(){state.generator.experiences.push({company:'',title:'',start:'',end:'',descs:['']});renderExperienceList();}
function removeExperience(i){state.generator.experiences.splice(i,1);renderExperienceList();}
function addExpDesc(i){state.generator.experiences[i].descs.push('');renderExperienceList();}
function removeExpDesc(i,j){state.generator.experiences[i].descs.splice(j,1);renderExperienceList();}
function saveExperienceData(){
  ['exp-company','exp-title','exp-start','exp-end'].forEach(function(cls){
    document.querySelectorAll('.'+cls).forEach(function(el){
      var idx=parseInt(el.dataset.idx),exp=state.generator.experiences[idx];if(!exp)return;
      if(cls==='exp-company')exp.company=el.value;if(cls==='exp-title')exp.title=el.value;
      if(cls==='exp-start')exp.start=el.value;if(cls==='exp-end')exp.end=el.value;
    });
  });
  document.querySelectorAll('.exp-desc').forEach(function(el){
    var idx=parseInt(el.dataset.idx),didx=parseInt(el.dataset.didx),exp=state.generator.experiences[idx];
    if(exp&&exp.descs)exp.descs[didx]=el.value;
  });
}

// Skills/Certs
function renderSkillsList(){
  var c=document.getElementById('skills-list');
  c.innerHTML=state.generator.skills.map(function(s,i){return '<div class="flex gap-8" style="margin-bottom:4px"><input class="form-input" onchange="state.generator.skills['+i+']=this.value" value="'+escHtml(s)+'"><button class="btn btn-ghost btn-sm" onclick="state.generator.skills.splice('+i+',1);renderSkillsList()">x</button></div>';}).join('')+
    '<button class="btn btn-outline btn-sm mt-8" onclick="state.generator.skills.push(\'\');renderSkillsList()">+ 添加技能</button>';
}
function renderCertsList(){
  var c=document.getElementById('certs-list');
  c.innerHTML=state.generator.certs.map(function(cert,i){return '<div class="flex gap-8" style="margin-bottom:4px"><input class="form-input" onchange="state.generator.certs['+i+']=this.value" value="'+escHtml(cert)+'"><button class="btn btn-ghost btn-sm" onclick="state.generator.certs.splice('+i+',1);renderCertsList()">x</button></div>';}).join('')+
    '<button class="btn btn-outline btn-sm mt-8" onclick="state.generator.certs.push(\'\');renderCertsList()">+ 添加证书</button>';
}

// ========== TEMPLATE RENDERING (DYNAMIC COLORS) ==========
function renderGeneratedResume() {
  var g=state.generator;
  var tpl=getTemplateById(state.selectedTemplate);
  var html=buildResumeHTML(g,tpl);
  document.getElementById('gen-preview').innerHTML=html;
  document.getElementById('gen-preview').className='resume-page sidebar-left';
  injectTemplateColors(tpl);
  bindResumeEdit();
}

// 将 state.generator 数据回填到引导模式的表单中
function fillGeneratorStepForms(data){
  var set = function(id, val){
    var el = document.getElementById(id);
    if(el) el.value = val||'';
  };
  set('gen-name', data.name);
  set('gen-title', data.title);
  set('gen-phone', data.phone);
  set('gen-email', data.email);
  set('gen-location', data.location);
  set('gen-school', data.school);
  set('gen-major', data.major);
  set('gen-degree', data.degree||'本科');
  set('gen-edustart', data.eduStart);
  set('gen-eduend', data.eduEnd);
  set('gen-majorcourses', data.majorCourses);
  set('gen-selfeval', data.selfEval);
  set('gen-languages', data.languages);
  set('gen-campusexp', data.campusExp);
  // 重新渲染经历/技能/证书列表（从state.generator取，刚被AI填充过）
  renderExperienceList();
  renderSkillsList();
  renderCertsList();
}

// 从步骤5跳转到指定引导步骤进行编辑
function editGeneratorStep(step){
  fillGeneratorStepForms(state.generator);
  // 切换到 guided 模式显示
  state.generator.mode = 'guided';
  switchGenMode('guided');
  updateGeneratorSteps(step);
  document.getElementById('gen-step-'+step).scrollIntoView({behavior:'smooth'});
}

// Step 5 编辑工具栏
function renderStep5EditBar(){
  var bar = document.getElementById('gen-edit-bar');
  if(!bar) return;
  bar.innerHTML =
    '<div class="card-header mb-12">编辑AI生成内容</div>'+
    '<div class="flex flex-wrap gap-8" style="margin-bottom:4px">'+
      '<button class="btn btn-outline btn-sm" onclick="editGeneratorStep(1)">✏️ 基本信息</button>'+
      '<button class="btn btn-outline btn-sm" onclick="editGeneratorStep(2)">✏️ 教育背景</button>'+
      '<button class="btn btn-outline btn-sm" onclick="editGeneratorStep(3)">✏️ 工作经历</button>'+
      '<button class="btn btn-outline btn-sm" onclick="editGeneratorStep(4)">✏️ 技能证书</button>'+
    '</div>'+
    '<div class="text-xs text-muted mt-8">点击对应模块编辑，完成后回到步骤5预览</div>';
}

function injectTemplateColors(tpl, rootEl) {
  var c=tpl.colors||state.templates.default?.colors||{};
  var root=rootEl||document.getElementById('gen-preview');
  if(!root)return;
  root.style.setProperty('--tpl-primary',c.primary||'#4E7282');
  root.style.setProperty('--tpl-accent',c.accent||'#4E7282');
  root.style.setProperty('--tpl-sidebar',c.sidebar||'#F5F7F8');
  root.style.setProperty('--tpl-text',c.text||'#333');
  root.style.setProperty('--tpl-border',c.border||'#E0E4E6');
  root.style.setProperty('--tpl-section-line',c.sectionLine||c.primary||'#4E7282');
  root.style.setProperty('--tpl-header-text',c.headerText||c.primary||'#4E7282');
  root.style.fontFamily=(tpl.font==='serif'?'"Noto Serif", "SimSun", Georgia, serif':'"微软雅黑","Microsoft YaHei", -apple-system, sans-serif');
}

// 将**text**转为<strong>text</strong>，用于数据加粗
function boldText(escapedHtml) {
  if (!escapedHtml) return '';
  return escapedHtml.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// 清理STAR/STAR标签前缀及完整英文写法
function cleanForDisplay(text) {
  if (!text) return '';
  return text
    // 带前缀的STAR简写: "S:背景", "T:任务", "A:行动", "R:结果"
    .replace(/^[•·\-]\s*[STAR][：:\s]*(?:背景|任务|行动|结果|任务\+[Aa]ction)?[：:\s]*/gm, '')
    // 不带前缀: "Situation:...", "Task:...", "Action:...", "Result:..."
    .replace(/^(?:Situation|Task|Action|Result)[：:\s]+/gim, '')
    // 散装的S/T/A/R:前缀
    .replace(/^[STAR][：:\s]+/gm, '')
    // 统一列表符号
    .replace(/^\s*[•·\-]\s*/gm, '• ');
}

function buildResumeHTML(data, template) {
  var c=template?.colors||state.templates.default?.colors||{};
  var pri=c.primary||'#4E7282',acc=c.accent||'#4E7282';
  var name=escHtml(data.name||'未填写'),title=escHtml(data.title||'');
  var contactItems=[data.phone||'',data.email||'',data.location||''];
  var contactLine=contactItems.filter(Boolean).join('  |  ');
  if(!contactLine) contactLine = '（点击编辑联系方式）';

  // 左侧栏（所有模块始终显示，空值留空）
  var sidebarHTML='';
  var infoItems=[];
  infoItems.push('<div class="rs-info-item"><span class="rs-info-label">毕业院校</span><span class="rs-info-val" contenteditable="true" data-field="school">'+escHtml(data.school||'')+'</span></div>');
  infoItems.push('<div class="rs-info-item"><span class="rs-info-label">学历</span><span class="rs-info-val" contenteditable="true" data-field="degree">'+escHtml(data.degree||'')+'</span></div>');
  infoItems.push('<div class="rs-info-item"><span class="rs-info-label">专业</span><span class="rs-info-val" contenteditable="true" data-field="major">'+escHtml(data.major||'')+'</span></div>');
  infoItems.push('<div class="rs-info-item"><span class="rs-info-label">电话</span><span class="rs-info-val" contenteditable="true" data-field="phone">'+escHtml(data.phone||'')+'</span></div>');
  infoItems.push('<div class="rs-info-item"><span class="rs-info-label">邮箱</span><span class="rs-info-val" contenteditable="true" data-field="email">'+escHtml(data.email||'')+'</span></div>');
  infoItems.push('<div class="rs-info-item"><span class="rs-info-label">现居城市</span><span class="rs-info-val" contenteditable="true" data-field="location">'+escHtml(data.location||'')+'</span></div>');
  sidebarHTML+='<div class="rs-section"><div class="rs-section-title-side">基本信息</div>'+infoItems.join('')+'</div>';

  // 技能（始终显示）
  var allSkills=(data.skills||[]).filter(Boolean);
  sidebarHTML+='<div class="rs-section"><div class="rs-section-title-side">技能特长</div>';
  if(allSkills.length>0){
    var hasCat = allSkills.some(function(s){return typeof s==='string' && /^(【.+?】|\[.+?\]|[一-龥a-zA-Z]+)\s*[-—–]/.test(s);});
    if (hasCat) {
      var usedCats = {};
      var mergedSkills = [];
      allSkills.forEach(function(s,i){
        var t = typeof s==='string'?s:'';
        var m = t.match(/^(?:【(.+?)】|\[(.+?)\])/);
        if (m) {
          var catName = (m[1] || m[2]).replace(/\s+/g,'');
          var bracketEnd = t.indexOf('】') !== -1 ? t.indexOf('】') + 1 : t.indexOf(']') + 1;
          var rest = t.substring(bracketEnd).replace(/^\s*[-—–\s]+/, '').trim();
          if (!usedCats[catName]) {
            usedCats[catName] = { cat: catName, items: [] };
            mergedSkills.push(usedCats[catName]);
          }
          if (rest) usedCats[catName].items.push(boldText(escHtml(rest)));
        } else {
          var dashIdx = t.search(/[-—–]/);
          if (dashIdx !== -1) {
            var catName = t.substring(0, dashIdx).trim().replace(/\s+/g,'');
            var rest = t.substring(dashIdx + 1).replace(/^[-—–\s]+/, '').trim();
            if (!usedCats[catName]) {
              usedCats[catName] = { cat: catName, items: [] };
              mergedSkills.push(usedCats[catName]);
            }
            if (rest) usedCats[catName].items.push(boldText(escHtml(rest)));
          } else {
            mergedSkills.push({ cat: null, items: [boldText(escHtml(t))] });
          }
        }
      });
      mergedSkills.forEach(function(catGroup, gi){
        if (catGroup.cat) {
          sidebarHTML += '<div class="rs-skill-cat"><div class="rs-skill-cat-label">'+escHtml(catGroup.cat)+'</div>';
          catGroup.items.forEach(function(item){
            sidebarHTML += '<div class="rs-skill-tag" contenteditable="true" data-field="skills" data-idx="0">'+item+'</div>';
          });
          sidebarHTML += '</div>';
        } else {
          catGroup.items.forEach(function(item){
            sidebarHTML += '<div class="rs-skill-tag" contenteditable="true" data-field="skills" data-idx="0">'+item+'</div>';
          });
        }
      });
    } else {
      allSkills.slice(0,10).forEach(function(s,i){
        sidebarHTML+='<div class="rs-skill-tag" contenteditable="true" data-field="skills" data-idx="'+i+'">'+boldText(escHtml(typeof s==='string'?s:''))+'</div>';
      });
    }
  } else {
    sidebarHTML+='<div class="text-xs text-muted" style="padding:8px 0">（点击编辑补充技能）</div>';
  }
  sidebarHTML+='</div>';
  // 证书（始终显示）
  sidebarHTML+='<div class="rs-section"><div class="rs-section-title-side">技能证书</div>';
  if(data.certs&&data.certs.length>0){
    data.certs.forEach(function(cert,i){sidebarHTML+='<div class="rs-skill-tag" contenteditable="true" data-field="certs" data-idx="'+i+'">'+boldText(escHtml(typeof cert==='string'?cert:''))+'</div>';});
  } else {
    sidebarHTML+='<div class="text-xs text-muted" style="padding:8px 0">（点击编辑补充证书）</div>';
  }
  sidebarHTML+='</div>';
  // 语言（始终显示）
  sidebarHTML+='<div class="rs-section"><div class="rs-section-title-side">语言能力</div><div class="rs-info-val" style="font-size:10pt" contenteditable="true" data-field="languages">'+boldText(escHtml(data.languages||''))+'</div></div>';

  // 右侧主区（所有模块始终显示）
  var mainHTML='';
  mainHTML+='<div class="rs-section"><div class="rs-section-title">自我评价</div><div class="rs-text" contenteditable="true" data-field="selfEval">'+boldText(escHtml(data.selfEval||''))+'</div></div>';

  // 教育（始终显示）
  mainHTML+='<div class="rs-section"><div class="rs-section-title">教育背景</div><div class="rs-edu-header">';
  mainHTML+='<span class="rs-edu-date" contenteditable="true" data-field="eduPeriod">'+escHtml(data.eduStart||'')+' - '+escHtml(data.eduEnd||'')+'</span>';
  mainHTML+='<span class="rs-edu-school"><span contenteditable="true" data-field="school">'+escHtml(data.school||'')+'</span> · <span contenteditable="true" data-field="degree">'+escHtml(data.degree||'')+'</span> · <span contenteditable="true" data-field="major">'+escHtml(data.major||'')+'</span></span></div>';
  mainHTML+='<div class="rs-courses" contenteditable="true" data-field="majorCourses">主修课程：'+boldText(escHtml(data.majorCourses||''))+'</div></div>';

  // 校园经历（始终显示）
  mainHTML+='<div class="rs-section"><div class="rs-section-title">校园经历</div>';
  if(data.campusExp){
    (data.campusExp||'').split('\n').forEach(function(line){line=line.trim();if(!line)return;
      if(line.indexOf('|')!==-1)mainHTML+='<div class="rs-exp-header"><span class="rs-exp-title" contenteditable="true" data-field="campusExp" data-line="'+line+'">'+boldText(escHtml(line))+'</span></div>';
      else mainHTML+='<div class="rs-bullet" contenteditable="true" data-field="campusExp" data-line="'+line+'">'+escHtml(line)+'</div>';
    });
  } else {
    mainHTML+='<div class="text-xs text-muted" style="padding:8px 0">（点击编辑补充校园经历）</div>';
  }
  mainHTML+='</div>';

  // 经历（始终显示）
  mainHTML+='<div class="rs-section"><div class="rs-section-title">实习经历</div>';
  var validExps=(data.experiences||[]).filter(function(e){return e.company||e.title;});
  if(validExps.length>0){
    validExps.forEach(function(exp,ei){
      var dates=[exp.start,exp.end].filter(Boolean).join(' - ');
      mainHTML+='<div class="rs-exp-header"><span class="rs-exp-title"><span contenteditable="true" data-field="exp-title" data-ei="'+ei+'">'+escHtml(exp.title||'')+'</span> | <span contenteditable="true" data-field="exp-company" data-ei="'+ei+'">'+escHtml(exp.company||'')+'</span></span><span class="rs-exp-date" contenteditable="true" data-field="exp-dates" data-ei="'+ei+'">'+escHtml(dates)+'</span></div>';
      (exp.descs||[]).forEach(function(d,j){if(d&&d.trim())mainHTML+='<div class="rs-bullet" contenteditable="true" data-field="exp-desc" data-ei="'+ei+'" data-di="'+j+'">'+boldText(escHtml(cleanForDisplay(d.trim())))+'</div>';});
    });
  } else {
    mainHTML+='<div class="text-xs text-muted" style="padding:8px 0">（点击编辑补充工作经历）</div>';
  }
  mainHTML+='</div>';

  return '<div class="rs-header"><div class="rs-header-left"><h1 class="rs-name" contenteditable="true" data-field="name">'+name+'</h1><div class="rs-title-sub" contenteditable="true" data-field="title">'+title+'</div>'+(contactLine?'<div class="rs-contact" contenteditable="true" data-field="contact">'+escHtml(contactLine)+'</div>':'')+'</div><div class="rs-header-right"><div class="rs-header-decor">个人简历</div><div class="rs-header-subtitle">细心从每一个小细节开始。</div><div class="rs-header-eng">PERSONAL RESUME</div></div></div><div class="rs-body"><div class="rs-sidebar">'+sidebarHTML+'</div><div class="rs-main">'+mainHTML+'</div></div>';
}

// ========== INLINE EDIT ==========
function bindResumeEdit() {
  var root=document.getElementById('gen-preview');
  if(!root)return;
  root.querySelectorAll('[contenteditable="true"]').forEach(function(el){
    el.addEventListener('blur', function() {
      var field=el.dataset.field;
      var val=el.textContent.trim();
      if(!field||!val) return;
      var ei=el.dataset.ei!==undefined?parseInt(el.dataset.ei):undefined;
      var di=el.dataset.di!==undefined?parseInt(el.dataset.di):undefined;
      var idx=el.dataset.idx!==undefined?parseInt(el.dataset.idx):undefined;

      // 更新state中的数据
      if(ei!==undefined&&di!==undefined&&field==='exp-desc'){
        var exp=state.generator.experiences[ei];
        if(exp&&exp.descs)exp.descs[di]=val;
      }else if(ei!==undefined&&field==='exp-title'){
        var exp=state.generator.experiences[ei];if(exp)exp.title=val;
      }else if(ei!==undefined&&field==='exp-company'){
        var exp=state.generator.experiences[ei];if(exp)exp.company=val;
      }else if(ei!==undefined&&(field==='exp-dates')){
        var exp=state.generator.experiences[ei];if(exp){var parts=val.split('-');exp.start=(parts[0]||'').trim();exp.end=(parts[1]||'').trim();}
      }else if(field==='skills'&&idx!==undefined){
        if(state.generator.skills[idx]!==undefined)state.generator.skills[idx]=val;
      }else if(field==='certs'&&idx!==undefined){
        if(state.generator.certs[idx]!==undefined)state.generator.certs[idx]=val;
      }else if(field==='eduPeriod'){
        var parts=val.split('-');state.generator.eduStart=(parts[0]||'').trim();state.generator.eduEnd=(parts[1]||'').trim();
      }else if(state.generator[field]!==undefined){
        state.generator[field]=val;
      }
    });
    // 视觉提示：hover时显示可编辑
    el.addEventListener('mouseenter', function(){el.style.outline='1px dashed #4E7282';el.style.outlineOffset='2px';});
    el.addEventListener('mouseleave', function(){el.style.outline='';el.style.outlineOffset='';});
  });
  console.log('Resume edit mode: all fields are editable. Click any text to modify.');
}

// ========== TEMPLATE SWITCHING ==========
function switchGeneratedTemplate() {
  var sel=document.getElementById('gen-template-select');
  state.selectedTemplate=sel.value;
  // 性能优化：仅更新CSS变量，不重建DOM
  var tpl=getTemplateById(state.selectedTemplate);
  var root=document.getElementById('gen-preview');
  if (root && tpl && tpl.colors) {
    injectTemplateColors(tpl);
    // 只更新section标题颜色（这些在CSS中使用了var(--tpl-primary)）
    // 不重建DOM，让CSS变量自动生效
  } else {
    renderGeneratedResume();
  }
}

function exportGeneratedPDF() {
  var tpl=getTemplateById(state.selectedTemplate);
  var c=tpl.colors||state.templates.default?.colors||{};
  var pri=c.primary||'#4E7282';
  var win=window.open('','_blank');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>个人简历</title>'+
    '<style>'+
    '@page{size:A4;margin:0}body{font-family:微软雅黑,-apple-system,sans-serif;font-size:11pt;color:#333;line-height:1.6;margin:0;padding:0}'+
    '.rs-header{display:flex;justify-content:space-between;align-items:flex-start;padding:20px 30px 12px;border-bottom:1.5px solid '+pri+';margin:0 25px}'+
    '.rs-name{font-size:24pt;color:'+pri+';margin:0;font-weight:800;letter-spacing:2px}.rs-title-sub{font-size:11pt;color:#666;margin-top:4px}.rs-contact{font-size:9pt;color:#999;margin-top:4px}'+
    '.rs-header-decor{font-size:30pt;color:'+pri+';font-weight:900;text-align:right;opacity:0.85}.rs-header-subtitle{font-size:8pt;color:#aaa;text-align:right}.rs-header-eng{font-size:14pt;color:'+pri+';text-align:right;opacity:0.7}'+
    '.rs-body{display:flex;padding:15px 25px}.rs-sidebar{width:28%;background:'+(c.sidebar||'#F5F7F8')+';padding:16px 14px;border-radius:2px}.rs-main{width:72%;padding:0 0 0 20px}'+
    '.rs-section{margin-bottom:14px}.rs-section-title{font-size:12pt;font-weight:700;color:'+pri+';border-bottom:1.5px solid '+pri+';padding-bottom:3px;margin-bottom:8px;letter-spacing:1px}'+
    '.rs-section-title-side{font-size:12pt;font-weight:700;color:'+pri+';border-bottom:1.5px solid '+pri+';padding-bottom:3px;margin-bottom:8px;letter-spacing:1px}'+
    '.rs-info-item{display:flex;justify-content:space-between;font-size:10pt;padding:3px 0;border-bottom:1px dotted #ddd}.rs-info-label{color:#999}.rs-info-val{color:#333;font-weight:500}'+
    '.rs-skill-tag{font-size:10pt;padding:2px 0;color:#555}.rs-text{font-size:10pt;color:#555;line-height:1.7}'+
    '.rs-edu-header{display:flex;justify-content:space-between;font-size:10.5pt;margin-bottom:4px}.rs-edu-school{font-weight:700}.rs-edu-date{color:#999}'+
    '.rs-courses{font-size:9.5pt;color:#888;margin-top:2px}.rs-exp-header{display:flex;justify-content:space-between;font-size:10.5pt;margin-bottom:2px;margin-top:8px}.rs-exp-title{font-weight:700}.rs-exp-date{color:#999;font-size:9.5pt}'+
    '.rs-bullet{font-size:10pt;color:#555;padding-left:14px;position:relative;margin:2px 0}.rs-bullet::before{content:"·";position:absolute;left:0;color:'+pri+';font-weight:700}'+
    'strong{color:'+pri+';font-weight:700}'+
    '.rs-skill-cat{margin-bottom:6px}.rs-skill-cat-label{font-size:9pt;font-weight:700;color:'+pri+';margin-bottom:2px;text-transform:uppercase;letter-spacing:.5px}'+
    '[contenteditable]{outline:none}'+
    '</style></head><body>'+document.getElementById('gen-preview').innerHTML+'</body></html>');
  win.document.close();setTimeout(function(){win.print();},500);
}

// ========== RESUME FILE IMPORT (PDF/DOCX/TXT) ==========
// ========== DYNAMIC CDN LOADER ==========
// 按需加载第三方库，减少首屏体积
function loadScript(url) {
  return new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = url;
    s.onload = resolve;
    s.onerror = function() { reject(new Error('加载失败: ' + url)); };
    document.head.appendChild(s);
  });
}

var _pdfjsReady=false;
function ensurePdfJs() {
  if (typeof pdfjsLib !== 'undefined') {
    if (!_pdfjsReady) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      _pdfjsReady = true;
    }
    return Promise.resolve();
  }
  return loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js').then(function() {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    _pdfjsReady = true;
  });
}

var _mammothReady = false;
function ensureMammoth() {
  if (typeof mammoth !== 'undefined') {
    _mammothReady = true;
    return Promise.resolve();
  }
  return loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js').then(function() {
    _mammothReady = true;
  });
}

function handleResumeFileImport(event) {
  var file = event.target.files[0];
  if (!file) return;
  var zone = document.getElementById('opt-import-zone');
  var origHTML = zone.innerHTML;
  zone.innerHTML = '<div class="import-drop-icon">⏳</div><div class="import-drop-info"><div class="import-drop-text">正在解析文件...</div></div>';
  zone.style.pointerEvents = 'none';

  var ext = file.name.split('.').pop().toLowerCase();
  var reader = new FileReader();

  function onText(text) {
    var ta = document.getElementById('opt-input');
    ta.value = text;
    zone.innerHTML = origHTML;
    zone.style.pointerEvents = '';
    showToast('已导入：' + file.name + '（' + (text.length > 500 ? (text.length/1000).toFixed(1)+'k' : text.length) + '字）');
    ta.scrollIntoView({behavior:'smooth',block:'center'});
    // Reset file input so same file can be re-imported
    document.getElementById('opt-file-input').value = '';
  }

  function onError(msg) {
    zone.innerHTML = origHTML;
    zone.style.pointerEvents = '';
    showToast(msg, 'error');
    document.getElementById('opt-file-input').value = '';
  }

  if (ext === 'txt') {
    reader.onload = function(e) { onText(e.target.result); };
    reader.onerror = function() { onError('文件读取失败'); };
    reader.readAsText(file);
  } else if (ext === 'pdf') {
    reader.onload = function(e) {
      ensurePdfJs().then(function() {
        var typedarray = new Uint8Array(e.target.result);
        pdfjsLib.getDocument({data: typedarray}).promise.then(function(pdf) {
          var totalPages = pdf.numPages;
          var pages = [];
          for (var i = 1; i <= totalPages; i++) {
            pages.push(pdf.getPage(i));
          }
          Promise.all(pages).then(function(pageObjs) {
            var texts = [];
            var done = 0;
            pageObjs.forEach(function(page, idx) {
              page.getTextContent().then(function(content) {
                var pageText = content.items.map(function(item) { return item.str; }).join(' ');
                texts[idx] = pageText;
                done++;
                if (done === totalPages) {
                  onText(texts.join('\n\n'));
                }
              });
            });
          }).catch(function() { onError('PDF解析失败，请尝试粘贴文本'); });
        }).catch(function() { onError('PDF解析失败，文件可能损坏'); });
      }).catch(function() { onError('PDF组件加载失败'); });
    };
    reader.readAsArrayBuffer(file);
  } else if (ext === 'docx') {
    reader.onload = function(e) {
      ensureMammoth().then(function() {
        mammoth.extractRawText({arrayBuffer: e.target.result})
          .then(function(result) { onText(result.value); })
          .catch(function() { onError('DOCX解析失败，请尝试粘贴文本'); });
      }).catch(function() { onError('DOCX组件加载失败'); });
    };
    reader.readAsArrayBuffer(file);
  } else {
    onError('不支持的文件格式，请使用 .txt / .pdf / .docx');
  }
}

// Drag & drop for optimizer import zone
(function() {
  var zone = document.getElementById('opt-import-zone');
  if (!zone) return;
  zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', function() { zone.classList.remove('dragover'); });
  zone.addEventListener('drop', function(e) {
    e.preventDefault();
    zone.classList.remove('dragover');
    var file = e.dataTransfer.files[0];
    if (file) {
      var dt = new DataTransfer();
      dt.items.add(file);
      document.getElementById('opt-file-input').files = dt.files;
      handleResumeFileImport({target: {files: dt.files}});
    }
  });
})();

// ========== OPTIMIZER WITH DEEPSEEK ==========
function runOptimization() {
  var input=document.getElementById('opt-input').value.trim();
  var jd=document.getElementById('opt-jd').value.trim();
  if(!input){showToast('请先输入简历内容','error');return;}
  var btn=document.getElementById('opt-run-btn');
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> 优化中...';

  var resultsEl = document.getElementById('opt-results');
  var loadingEl = document.getElementById('opt-loading');
  var progressTimer = null;
  if (!loadingEl) {
    loadingEl = document.createElement('div');
    loadingEl.id = 'opt-loading';
    loadingEl.className = 'card';
    loadingEl.style.padding = '32px';
    loadingEl.innerHTML =
      '<div class="gen-progress">'+
        '<div class="gen-progress-steps">'+
          '<div class="gen-progress-step active" data-step="1"><div class="gen-progress-dot"></div><span>简历解析</span></div>'+
          '<div class="gen-progress-line"></div>'+
          '<div class="gen-progress-step" data-step="2"><div class="gen-progress-dot"></div><span>JD匹配</span></div>'+
          '<div class="gen-progress-line"></div>'+
          '<div class="gen-progress-step" data-step="3"><div class="gen-progress-dot"></div><span>智能优化</span></div>'+
          '<div class="gen-progress-line"></div>'+
          '<div class="gen-progress-step" data-step="4"><div class="gen-progress-dot"></div><span>生成报告</span></div>'+
        '</div>'+
        '<div class="gen-progress-bar"><div class="gen-progress-fill"></div></div>'+
        '<div class="gen-progress-text">正在解析简历结构...</div>'+
      '</div>'+
      '<div class="skeleton-line"></div>'+
      '<div class="skeleton-line" style="width:85%"></div>'+
      '<div class="skeleton-line" style="width:70%"></div>';
    resultsEl.parentNode.insertBefore(loadingEl, resultsEl);
    loadingEl.scrollIntoView({behavior:'smooth'});
    // 模拟进度动画
    var osteps = loadingEl.querySelectorAll('.gen-progress-step');
    var obar = loadingEl.querySelector('.gen-progress-fill');
    var otext = loadingEl.querySelector('.gen-progress-text');
    var otexts = ['正在解析简历结构...', '正在与岗位JD进行匹配分析...', '正在应用STAR法则智能改写...', '正在生成优化报告...'];
    var oidx = 0;
    progressTimer = setInterval(function() {
      oidx++;
      if (oidx >= 4) { clearInterval(progressTimer); progressTimer = null; return; }
      osteps[oidx].classList.add('active');
      obar.style.width = ((oidx+1)*25) + '%';
      otext.textContent = otexts[oidx];
    }, 1500);
  }

  // Section-aware resume optimization with anti-fabrication guardrails
  var prompt='你是一位资深HR总监兼简历顾问。请分模块优化以下简历，输出一份完整的优化后简历全文。\n\n'+
    '【核心原则 — 严格遵守】\n'+
    '1. 输出完整的优化后简历，保留所有原始模块（基本信息、教育、技能、经历、项目、证书、自我评价等全部模块）\n'+
    '2. 严禁增删任何实质性内容：不要编造原始简历中不存在的数据、数字、百分比、人名、项目名、公司名、时间\n'+
    '3. 量化数据只能从原文提取，原文没有就不要加数字。缺失量化数据在建议中指出\n'+
    '4. 不要删除任何内容模块，只能优化措辞和格式。每个原始段落都要对应到输出\n'+
    '5. 优化后fullResume必须是完整的简历全文，与原文字数相当或略多\n\n'+
    '【分模块优化策略】\n'+
    '▸ 全局动词升级：将"负责""参与""协助""进行""做了""从事"等弱动词全部替换为强动词（主导/搭建/推动/优化/设计/统筹/落地/驱动/达成/输出/撰写），每条经历都必须使用强势动词开头。禁用"负责""参与"这两个词\n'+
    '▸ 基本信息：保持原样不动，不要修改姓名/电话/邮箱/城市/求职意向\n'+
    '▸ 教育背景：保持原样，可补充主修方向（基于专业合理推断，例如"主修课程：数据结构、操作系统"）\n'+
    '▸ 技能特长：按3-4个大类归并整理（编程开发/办公协作/设计工具/语言能力等），每类2-3项具体技能+使用场景。不要拆分过多零散类别。有JD则对齐JD中的高频关键词\n'+
    '▸ 工作经历：用STAR法则改写语序，强势动词开头（主导/搭建/推动/优化/统筹），纳入原文已有量化数据，每段2-5句。只改写措辞，不改变事实\n'+
    '▸ 项目经历：同工作经历，突出个人角色和具体贡献\n'+
    '▸ 自我评价：基于原文真实经历提炼3-5句，删除"学习能力强""吃苦耐劳""性格开朗"等无效虚词，用能力+事例取代\n'+
    '▸ 证书/语言/校园经历：保持原样，微调格式\n'+
    '▸ 有JD时：确保JD中的核心技能关键词自然融入经历描述和技能模块，但不生硬堆砌\n\n'+
    '【原始简历】\n'+input+'\n\n'+
    (jd?'【目标JD】\n'+jd+'\n\n':'')+
    '返回严格JSON（不要```json标记，不要任何解释）：\n'+
    '{\n'+
    '  "fullResume": "完整的优化后简历全文（必须包含所有模块，保留换行和段落结构，比原文更专业但信息完整）",\n'+
    '  "changedSections": [{"section":"模块名（如工作经历/技能特长/自我评价）","summary":"一句话说明改了什么和为什么"}],\n'+
    '  "unchangedSections": ["未改动的模块名（如基本信息/教育背景）"],\n'+
    '  "suggestions": [{"title":"建议标题","detail":"详细说明和修改示范","level":"critical|important|suggestion"}],\n'+
    '  "atsScore": 85,\n'+
    '  "jdKeywords": ["从JD提取的关键词"],\n'+
    '  "jdMatchScore": 75\n'+
    '}';

  callDeepSeek(prompt, function(err, text) {
    var result, usedLocal = false;
    if (err || !text) {
      console.log('DeepSeek optimizer failed, using local:', err);
      result = optimizeResumeLocal(input, jd);
      usedLocal = true;
    } else {
      try {
        var jsonStr = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
        var aiData = JSON.parse(jsonStr);
        var localAts=runATSChecks(input);
        // 兼容新旧格式：优先fullResume，fallback到optimizedLines
        var optimizedText = aiData.fullResume || (aiData.optimizedLines||[]).join('\n');
        result = {
          before: input,
          after: optimizedText,
          changedSections: aiData.changedSections || [],
          unchangedSections: aiData.unchangedSections || [],
          atsScore: aiData.atsScore||Math.round((localAts.filter(function(a){return a.passed;}).length/localAts.length)*100),
          atsResults: localAts,
          suggestions: (aiData.suggestions||[]).map(function(s){
            if (typeof s === 'string') return {title:'优化建议', detail:s, level:'suggestion'};
            return {title:s.title||'优化建议', detail:s.detail||'', level:s.level||'suggestion'};
          }),
          jdKeywords: aiData.jdKeywords||(jd?extractJDKeywords(jd):[]),
          jdMatchScore: aiData.jdMatchScore||(jd?calcJDMatch(input, extractJDKeywords(jd)):0)
        };
      } catch(e) {
        console.log('Parse error, local fallback:', e);
        result = optimizeResumeLocal(input, jd);
        usedLocal = true;
      }
    }
    state.optimizerResult = result;
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    var loadingEl2 = document.getElementById('opt-loading');
    if (loadingEl2) loadingEl2.remove();

    // Display basic results immediately
    displayOptimizerResult(result);
    document.getElementById('opt-results').style.display='block';
    document.getElementById('opt-results').scrollIntoView({behavior:'smooth'});

    // Run deep JD matching asynchronously and update JD section
    if (jd && jd.length >= 20) {
      runDeepJDMatching(input, jd, function(deepResult) {
        if (deepResult) {
          result.jdDeepResult = deepResult;
          state.optimizerResult = result;
          displayJDMatchResult(deepResult, result.jdKeywords, result.jdMatchScore);
        }
      });
    }
    if (usedLocal) {
      var why = err ? (err.message || err.toString()).substring(0, 30) : '解析格式异常';
      showToast('AI服务暂时不可用(' + why + ')，已使用本地引擎优化','success');
    }
    btn.disabled = false; btn.innerHTML = '🚀 开始智能优化';
  }, 'pro');
}

function optimizeResumeLocal(input, jd) {
  var lines=input.split(/\n/).filter(function(l){return l.trim();});
  var suggestions=[];
  var WEAK={
    '负责':['主导','统筹','管理'],
    '参与':['核心推动','协同主导'],
    '协助':['支撑','驱动'],
    '了解':['掌握','精通'],
    '熟悉':['精通','深入理解'],
    '处理':['高效解决','快速响应'],
    '完成':['出色交付','圆满完成'],
    '整理':['系统梳理','结构化整合'],
    '沟通':['协调对接','跨部门协同'],
    '写':['撰写','输出'],
    '做':['推进','落地'],
    '改':['优化迭代','持续改进'],
    '学习':['深入研究','系统掌握'],
    '使用':['熟练运用','灵活应用'],
    '帮助':['赋能','服务'],
    '保证':['确保','保障'],
    '提供':['输出','交付'],
    '进行':['开展','实施'],
    '得到':['获得','取得'],
    '觉得':['洞察','识别']
  };

  // 句子级重构模式：将弱开头转换为强动词开头 + 量化结尾
  var RESTRUCTURE_PATTERNS = [
    // 模式1: "负责XXX的工作" → "主导XXX工作"
    { pattern: /负责(.{2,30})(的)?工作/g, replacement: '主导$1工作' },
    // 模式2: "负责XXX相关业务" → "统筹XXX业务"
    { pattern: /负责(.{2,30})相关业务/g, replacement: '统筹$1业务' },
    // 模式3: "参与XXX项目" → "深度参与XXX项目核心模块"
    { pattern: /参与(.{2,20})(项目|工程)/g, replacement: '深度参与$1$2核心模块' },
    // 模式4: "协助XXX进行" → "支撑XXX高效"
    { pattern: /协助(.{2,20})进行/g, replacement: '支撑$1高效' },
    // 模式5: "协助XXX工作" → "协同推进XXX工作"
    { pattern: /协助(.{2,20})工作/g, replacement: '协同推进$1工作' },
    // 模式6: "通过XXX方式，实现/完成" → 保留但优化
    { pattern: /通过(.{4,30})(方式|方法)，/g, replacement: '通过$1，' },
  ];

  var optimized = lines.map(function(line){
    var t=line.trim(); if(t.length<5) return t;
    var o=t;

    // 步骤1: 先做句子级重构
    RESTRUCTURE_PATTERNS.forEach(function(rp){
      o=o.replace(rp.pattern, rp.replacement);
    });

    // 步骤2: 弱动词替换
    Object.keys(WEAK).forEach(function(w){
      if(o.indexOf(w)!==-1){
        o=o.replace(new RegExp(w, 'g'), WEAK[w][0]);
      }
    });

    // 步骤3: 在描述末尾补充量化模板（若完全无数值）
    // 只给长度>15的句子加，且不重复加
    if(o.length>15 && !/\d+[%人万元+\-]/.test(o) && !o.match(/量化|数字|数据|XX/)){
      // 有"提升/优化/改善"但无量化的，追加模板
      if(/(提升|优化|改善|提高|缩短|减少|增加)/.test(o) && !o.match(/。$/)){
        o+='，取得了显著成效';
      }
    }

    return o;
  }).join('\n');

  // ATS检查
  var ats=runATSChecks(input);
  var passedCount=ats.filter(function(a){return a.passed;}).length;
  var atsScore=Math.round((passedCount/ats.length)*100);

  // 检测问题并给出建议（增强版）
  var weakVerbs=['负责','参与','协助','帮忙','做了','做过','进行','得到'];
  var weakCount=0;lines.forEach(function(l){weakVerbs.forEach(function(w){if(l.indexOf(w)!==-1)weakCount++;});});
  if(weakCount>0) suggestions.push({title:'弱动词过多（'+weakCount+'处）',detail:'HR对"负责/参与/协助/进行"开头的描述几乎免疫。建议全部替换为"主导/搭建/推动/优化/输出"等强动词，让HR感受到你的主动性。已自动替换部分，请人工核实。',level:'critical'});
  if(!/(手机|电话|邮箱|email|@)/.test(input)) suggestions.push({title:'缺少联系方式',detail:'简历中没有手机号或邮箱，HR无法联系你。请在简历顶部添加。',level:'critical'});
  if(!/(大学|学院|本科|硕士|博士|学历|教育|毕业|专业)/.test(input)) suggestions.push({title:'缺少教育背景',detail:'教育背景是HR筛选的基本条件。请添加学校名称、专业、学历。',level:'critical'});
  if(!/\d+%|\d+人|\d+万|\d+元|\d+\+/.test(input)) suggestions.push({title:'缺少量化数据',detail:'含具体数字的简历获约率更高。请回忆并补充真实数据（如"管理3人团队""服务50+客户"）。不要编造数据，但可以写模糊范围如"数十""百余"。',level:'important'});
  if(!/(技能|掌握|熟练|精通|擅长|证书|工具|软件|编程)/.test(input)) suggestions.push({title:'缺少技能模块',detail:'添加专业技能和工具清单，这是ATS关键词匹配的核心区域。用逗号分隔列出最相关的5-10项技能。',level:'important'});
  if(input.length<300) suggestions.push({title:'内容丰富度不足（'+input.length+'字）',detail:'当前内容偏短。建议补充工作/实习/项目经历，目标500-800字。每段经历至少写2-3条描述。',level:'important'});
  if(!/(提升|增长|降低|优化|改善|提高|缩短|减少|增加)/.test(input)) suggestions.push({title:'缺少成果导向表述',detail:'建议补充行动带来的具体成果，如"通过XX方法使效率提升X%"。STAR法则中R(Result)是最能打动HR的部分。',level:'suggestion'});
  if(jd&&jd.length>20&&!jdKeywordsInResume(input,extractJDKeywords(jd))) suggestions.push({title:'JD关键词未命中',detail:'简历内容与目标岗位JD几乎没有关键词重叠。建议仔细阅读JD，将其中提到的技能和职责自然地融入简历描述中。',level:'important'});
  if(!/(自我评价|个人简介|关于我|个人优势)/.test(input)&&input.length>200) suggestions.push({title:'缺少个人简介',detail:'在简历顶部加一段2-3行个人简介（Profile Summary），提炼核心竞争力和职业目标，有助于在5秒内抓住HR注意力。',level:'suggestion'});

  // JD关键词分析
  var jdKw=[],jdScore=0;
  if(jd){
    jdKw=extractJDKeywords(jd);
    jdScore=calcJDMatch(input,jdKw);
    if(jdKw.length>0){
      var missing=jdKw.filter(function(k){return input.indexOf(k)===-1;}).slice(0,5);
      suggestions.push({title:'JD关键词匹配度：'+jdScore+'%',detail:'从JD提取**'+jdKw.length+'**个关键词：'+jdKw.slice(0,12).join('、')+(missing.length>0?'。简历中缺失：**'+missing.join('、')+'**，建议自然融入经历描述中而非硬堆。':'。关键词覆盖良好！'),level:jdScore<40?'critical':jdScore<70?'important':'suggestion'});
    }
  }

  return {before:input, after:optimized, changedSections:[], unchangedSections:[],
    atsScore:atsScore>=30?atsScore:Math.min(atsScore+25,70), atsResults:ats,
    suggestions:suggestions, jdKeywords:jdKw, jdMatchScore:jdScore};
}

function jdKeywordsInResume(resume, keywords){
  if(!keywords||!keywords.length)return true;
  var hit=0;keywords.forEach(function(k){if(resume.indexOf(k)!==-1)hit++;});
  return hit/keywords.length>0.3;
}

function runATSChecks(text) {
  var checks=[
    // 基础信息（critical）
    {label:'手机号完整',check:function(t){return/1[3-9]\d{9}/.test(t);},critical:true,desc:'含有效手机号'},
    {label:'电子邮箱',check:function(t){return/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(t);},critical:true,desc:'含邮箱地址'},
    {label:'教育背景信息',check:function(t){return/(大学|学院|本科|硕士|博士|学历|教育|毕业|专业)/i.test(t);},critical:true,desc:'有学校/学历'},
    {label:'工作经历描述',check:function(t){return/(工作|项目|实习|经历|经验|运营|开发|设计|管理|负责|参与)/i.test(t);},critical:true,desc:'有经历描述'},
    {label:'专业技能模块',check:function(t){return/(技能|掌握|熟练|精通|擅长|证书|工具|软件|语言|编程)/i.test(t);},critical:true,desc:'有技能列表'},

    // 内容质量（important）
    {label:'量化成果数据',check:function(t){return/\d+%|\d+人|\d+万|\d+元|\d+\+|\d+家|\d+个|\d+项|\d+次/.test(t);},critical:false,desc:'有数据支撑'},
    {label:'强动词开头',check:function(t){return/(主导|设计|开发|实现|推动|带领|管理|创建|优化|提升|完成|输出|达成|搭建|撰写|统筹|驱动)/.test(t);},critical:false,desc:'动词有力'},
    {label:'成果导向表述',check:function(t){return/(提升|增长|降低|优化|改善|提高|缩短|减少|增加|达成|超出)/.test(t);},critical:false,desc:'有成果描述'},

    // 格式合规
    {label:'纯文本格式',check:function(t){return!/(照片|图片|头像|表格|图表)/i.test(t);},critical:false,desc:'无图片/表格'},
    {label:'无特殊格式符',check:function(t){return!/[┌┐└┘├┤─│○●◆◇═║╔╗╚╝]/g.test(t);},critical:false,desc:'ATS可解析'},
    {label:'内容长度适中',check:function(t){return t.length>=200&&t.length<=5000;},critical:false,desc:'200-5000字符'},
    {label:'无URL超长',check:function(t){var urls=t.match(/https?:\/\/[^\s]+/g);return!urls||urls.every(function(u){return u.length<80;});},critical:false,desc:'链接简洁'},

    // 加分项
    {label:'个人简介/概要',check:function(t){return/(自我评价|个人简介|关于我|个人优势|Profile|Summary|资深|经验丰富)/i.test(t);},critical:false,desc:'有个人简介'},
    {label:'教育时间完整',check:function(t){return/\d{4}[.\-年]\d{1,2}[.\-月]?\s*[-~到]\s*\d{4}[.\-年]/.test(t)||/(20\d{2})\s*[-~到]\s*(20\d{2}|至今)/.test(t);},critical:false,desc:'教育时间完整'},
    {label:'多段经历',check:function(t){return(t.match(/(\d{4}[.\-年])/g)||[]).length>=4;},critical:false,desc:'≥2段经历（时间标记≥4个）'},
  ];
  return checks.map(function(a){return Object.assign({},a,{passed:a.check(text)});});
}

function extractJDKeywords(jd) {
  var stop='的了在是有和与或等需要具备具有优先'.split('');
  var words=jd.replace(/[^一-龥\w]/g,' ').split(/\s+/).filter(function(w){return w.length>=2&&stop.indexOf(w)===-1;});
  var freq={};words.forEach(function(w){freq[w]=(freq[w]||0)+1;});
  return Object.entries(freq).filter(function(e){return e[1]>=2;}).sort(function(a,b){return b[1]-a[1];}).slice(0,20).map(function(e){return e[0];});
}
function calcJDMatch(resume,kw){if(!kw.length)return 0;return Math.round((kw.filter(function(k){return resume.indexOf(k)!==-1;}).length/kw.length)*100);}

// ========== JD DEEP MATCHING (DeepSeek-Powered) ==========
function runDeepJDMatching(input, jd, callback) {
  if (!jd || jd.length < 20) { callback(null); return; }

  var prompt = '你是一位资深招聘专家，请深度分析简历与JD的匹配度。\n\n'+
    '【候选人简历】\n'+input+'\n\n'+
    '【目标岗位JD】\n'+jd+'\n\n'+
    '请从以下维度进行精准匹配分析，返回JSON：\n'+
    '1. 硬技能匹配：JD要求的工具/技术/证书，简历中是否具备\n'+
    '2. 软技能匹配：沟通/协作/领导力等隐性要求\n'+
    '3. 经验匹配：行业背景、项目类型、工作年限等\n'+
    '4. 关键词覆盖：JD中的高频关键词在简历中的出现情况\n'+
    '5. 缺失关键能力：JD要求但简历中缺失的TOP能力\n'+
    '6. 简历优化方向：针对该JD的具体改写建议\n\n'+
    '返回JSON：\n'+
    '{\n'+
    '  "overallScore": 75,\n'+
    '  "hardSkills": {"score":80,"matched":["匹配技能1","匹配技能2"],"missing":["缺失技能1"]},\n'+
    '  "softSkills": {"score":70,"matched":["匹配软技能"],"missing":["缺失软技能"]},\n'+
    '  "experience": {"score":65,"analysis":"行业经验匹配度分析"},\n'+
    '  "keywords": {"found":["已覆盖关键词"],"missing":["缺失关键词"]},\n'+
    '  "topGaps": ["最关键的1个能力差距","第2个","第3个"],\n'+
    '  "optimizationTips": ["具体改写建议1：在XX经历中突出XX能力","建议2"]\n'+
    '}';

  callDeepSeek(prompt, function(err, text) {
    if (err || !text) { callback(null); return; }
    try {
      var jsonStr = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
      var result = JSON.parse(jsonStr);
      callback(result);
    } catch(e) {
      callback(null);
    }
  });
}

function displayJDMatchResult(deepResult, jdKeywords, jdMatchScore) {
  var container = document.getElementById('jd-match-container');
  var resultEl = document.getElementById('jd-match-result');
  if (!container || !resultEl) return;

  container.style.display = 'block';
  var html = '';

  if (deepResult && deepResult.overallScore) {
    // Deep matching result
    var score = deepResult.overallScore;
    var scoreColor = score >= 70 ? 'var(--green)' : score >= 50 ? 'var(--orange)' : 'var(--red)';
    html += '<div style="font-size:2.5rem;font-weight:800;color:'+scoreColor+'">'+score+'%</div>';
    html += '<div class="jd-match-bar"><div class="jd-match-fill" style="width:'+score+'%"></div></div>';
    html += '<div class="text-sm text-muted mb-16">AI深度匹配评分（综合硬技能+软技能+经验）</div>';

    // Skill breakdown
    if (deepResult.hardSkills) {
      var hs = deepResult.hardSkills;
      html += '<div class="jd-skill-row"><div class="jd-skill-label">硬技能</div><div class="jd-skill-score" style="color:'+(hs.score>=70?'var(--green)':hs.score>=50?'var(--orange)':'var(--red)')+'">'+hs.score+'%</div></div>';
      if (hs.matched && hs.matched.length) html += '<div class="jd-tags">'+hs.matched.slice(0,4).map(function(k){return '<span class="tag tag-green">'+escHtml(k)+'</span>';}).join('')+'</div>';
      if (hs.missing && hs.missing.length) html += '<div class="jd-tags mt-4">'+hs.missing.slice(0,4).map(function(k){return '<span class="tag tag-red">缺失: '+escHtml(k)+'</span>';}).join('')+'</div>';
    }
    if (deepResult.softSkills) {
      var ss = deepResult.softSkills;
      html += '<div class="jd-skill-row mt-12"><div class="jd-skill-label">软技能</div><div class="jd-skill-score" style="color:'+(ss.score>=70?'var(--green)':ss.score>=50?'var(--orange)':'var(--red)')+'">'+ss.score+'%</div></div>';
    }
    if (deepResult.experience) {
      html += '<div class="jd-skill-row mt-12"><div class="jd-skill-label">经验匹配</div><div class="jd-skill-score" style="color:'+(deepResult.experience.score>=70?'var(--green)':deepResult.experience.score>=50?'var(--orange)':'var(--red)')+'">'+deepResult.experience.score+'%</div></div>';
      if (deepResult.experience.analysis) html += '<div class="text-xs text-muted mt-4">'+escHtml(deepResult.experience.analysis)+'</div>';
    }

    // Top gaps
    if (deepResult.topGaps && deepResult.topGaps.length) {
      html += '<div class="mt-12"><div class="text-xs font-bold mb-4" style="color:var(--red)">关键能力差距</div>';
      deepResult.topGaps.slice(0,3).forEach(function(g) {
        html += '<div class="jd-gap-item">'+escHtml(g)+'</div>';
      });
      html += '</div>';
    }
  } else {
    // Fallback: keyword-based matching
    html += '<div style="font-size:2rem;font-weight:800;color:var(--accent)">'+jdMatchScore+'%</div>';
    html += '<div class="jd-match-bar"><div class="jd-match-fill" style="width:'+jdMatchScore+'%"></div></div>';
    html += '<div class="text-xs text-muted">JD关键词匹配度</div>';
    html += '<div class="flex gap-8 mt-8" style="flex-wrap:wrap">'+jdKeywords.slice(0,8).map(function(k){return '<span class="tag">'+escHtml(k)+'</span>';}).join('')+'</div>';
  }

  resultEl.innerHTML = html;
}

function displayOptimizerResult(r) {
  document.getElementById('opt-before').textContent=r.before;
  // 简单行级 diff：高亮 after 中变化/新增的行
  var beforeLines = (r.before||'').split('\n').filter(Boolean);
  var afterLines = (r.after||'').split('\n');
  var afterHtml = afterLines.map(function(line) {
    var trimmed = line.trim();
    if (!trimmed) return '<br>';
    // 如果在before中找不到这行（忽略首尾空格），标记为新增
    var isNew = beforeLines.every(function(bl) { return bl.trim() !== trimmed; });
    if (isNew) {
      return '<div style="padding:2px 6px;margin:2px -6px;background:rgba(16,185,129,.08);border-radius:4px">' + escHtml(line) + '</div>';
    }
    return escHtml(line);
  }).join('\n');
  document.getElementById('opt-after').innerHTML = afterHtml;
  document.getElementById('opt-score-text').textContent=r.atsScore;
  document.getElementById('opt-score-circle').style.setProperty('--percent',(r.atsScore/100*360)+'deg');
  document.getElementById('ats-checklist').innerHTML=r.atsResults.map(function(a){
    var icon=a.passed?'✓':(a.critical?'✗':'△'),cls=a.passed?'pass':(a.critical?'fail':'warn');
    return '<div class="ats-item '+cls+'"><span class="ats-icon">'+icon+'</span> '+a.label+'</div>';
  }).join('');

  // 模块变更摘要
  var changesEl = document.getElementById('opt-changes-summary');
  var changedSections = r.changedSections || [];
  var unchangedSections = r.unchangedSections || [];
  if (changesEl && (changedSections.length > 0 || unchangedSections.length > 0)) {
    var changesHtml = '';
    if (changedSections.length > 0) {
      changesHtml += '<div class="text-xs text-muted mb-8" style="text-transform:uppercase;letter-spacing:.5px">已优化的模块</div>';
      changedSections.forEach(function(cs){
        changesHtml += '<div style="padding:8px 12px;margin-bottom:6px;background:#f0fdf4;border-radius:8px;border-left:3px solid var(--green);font-size:.85rem"><span class="font-bold">'+escHtml(cs.section||'')+'</span><span class="text-muted"> — '+escHtml(cs.summary||'')+'</span></div>';
      });
    }
    if (unchangedSections.length > 0) {
      changesHtml += '<div class="text-xs text-muted mt-12 mb-8" style="text-transform:uppercase;letter-spacing:.5px">保持原样的模块</div>';
      unchangedSections.forEach(function(s){
        changesHtml += '<span style="display:inline-block;padding:3px 10px;margin:2px 4px;background:#f5f5f5;border-radius:20px;font-size:.8rem;color:#888">'+escHtml(s)+'</span>';
      });
    }
    changesEl.innerHTML = changesHtml;
    changesEl.style.display = 'block';
  } else if (changesEl) {
    changesEl.style.display = 'none';
  }

  // JD matching display
  displayJDMatchResult(r.jdDeepResult || null, r.jdKeywords || [], r.jdMatchScore || 0);

  document.getElementById('opt-suggestions').innerHTML=r.suggestions.map(function(s){
    var levelIcon=s.level==='critical'?'🔴':s.level==='important'?'🟡':'💡';
    var levelLabel=s.level==='critical'?'关键问题':s.level==='important'?'重要优化':'建议';
    var levelColor=s.level==='critical'?'#e74c3c':s.level==='important'?'#f39c12':'#4E7282';
    return '<div class="suggestion-item" style="padding:14px 16px;margin-bottom:10px;background:#fff;border-radius:12px;border-left:3px solid '+levelColor+'"><div class="flex-between" style="margin-bottom:6px"><span class="font-bold text-sm">'+escHtml(s.title||'')+'</span><span class="suggestion-badge" style="font-size:0.75rem;padding:2px 8px;border-radius:10px;background:'+(s.level==='critical'?'#fde8e8':s.level==='important'?'#fef3c7':'#e8f4f8')+';color:'+levelColor+'">'+levelIcon+' '+levelLabel+'</span></div><div class="text-sm text-muted" style="line-height:1.65">'+boldText(escHtml(s.detail||''))+'</div></div>';
  }).join('');
}

function copyOptimized(){if(!state.optimizerResult)return;navigator.clipboard.writeText(state.optimizerResult.after).then(function(){showToast('已复制');});}
function exportOptimizedPDF(){
  if(!state.optimizerResult)return;
  var w=window.open('','_blank');
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>优化简历</title><style>body{font-family:微软雅黑,sans-serif;max-width:800px;margin:40px auto;line-height:1.8;color:#333}h2{color:#4E7282;border-bottom:2px solid #4E7282}</style></head><body>'+state.optimizerResult.after.split('\n').map(function(l){return l.trim()?'<p>'+l+'</p>':'<br>';}).join('')+'</body></html>');
  w.document.close();setTimeout(function(){w.print();},300);
}

// ========== TEMPLATE SYSTEM ==========
function loadTemplates(){
  fetch('templates/library.json').then(function(r){return r.json();}).then(function(data){
    state.templates.default=data.default;state.templates.library=data.templates;
    var imp=localStorage.getItem('resumepro-imported-templates');if(imp){try{state.templates.imported=JSON.parse(imp);}catch(e){}}
    updateTemplateSelector();
    refreshTemplateGridIfActive();
  }).catch(function(){
    state.templates.default={id:'default',name:'简约专业版',colors:{primary:'#4E7282',accent:'#4E7282',sidebar:'#F5F7F8',text:'#333',border:'#E0E4E6',headerText:'#4E7282',sectionLine:'#4E7282'},layout:'sidebar-left',font:'微软雅黑'};
    state.templates.library=[];
    updateTemplateSelector();
    refreshTemplateGridIfActive();
  });
}
function refreshTemplateGridIfActive(){
  if(state.currentSection==='templates'){
    var activeTab=document.querySelector('#template-tabs .tab.active');
    renderTemplateGrid(activeTab?activeTab.dataset.cat:'all');
  }
}

function getTemplateById(id){
  if(id==='default')return state.templates.default||{};
  return state.templates.library.find(function(t){return t.id===id;})||state.templates.imported.find(function(t){return t.id===id;})||state.templates.default||{};
}

function updateTemplateSelector(){
  var s=document.getElementById('gen-template-select');if(!s)return;
  var all=[{id:'default',name:'简约专业版（默认）'}].concat(state.templates.library).concat(state.templates.imported);
  s.innerHTML=all.map(function(t){return '<option value="'+t.id+'" '+(state.selectedTemplate===t.id?'selected':'')+'>'+escHtml(t.name)+'</option>';}).join('');
}

function renderTemplateGrid(cat){
  cat=cat||'all';var grid=document.getElementById('template-grid'),empty=document.getElementById('templates-empty');
  // 防止模板未加载时渲染空白
  if(!state.templates.default){
    grid.innerHTML='<div class="skeleton-card" style="height:100px"></div><div class="skeleton-line"></div><div class="skeleton-line" style="width:70%"></div>';
    empty.style.display='none';return;
  }
  var templates=[];
  if(cat==='all'||cat==='builtin'){templates.push(Object.assign({},state.templates.default,{id:'default',source:'builtin'}));templates=templates.concat(state.templates.library.map(function(t){return Object.assign({},t,{source:'builtin'});}));}
  if(cat==='all'||cat==='imported')templates=templates.concat(state.templates.imported.map(function(t){return Object.assign({},t,{source:'imported'});}));
  if(templates.length===0){grid.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  grid.innerHTML=templates.map(function(t){
    var prev=typeof t.preview==='string'?t.preview:(t.colors?t.colors.accent:'#4E7282'),sel=state.selectedTemplate===t.id?'selected':'';
    return '<div class="template-card '+sel+'" onclick="previewTemplate(\''+t.id+'\')"><div class="template-preview" style="background:'+prev+'"><span>'+escHtml(t.name)+'</span></div><div class="template-info"><div class="template-name">'+escHtml(t.name)+(t.source==='imported'?' 自定义':'')+'</div><div class="template-desc">'+escHtml(t.description||'')+'</div></div></div>';
  }).join('');
}

function previewTemplate(id){
  var tpl=getTemplateById(id);state.selectedTemplateId=id;
  var sample={name:'张三',title:'高级工程师',phone:'138-0000-0000',email:'zhangsan@email.com',location:'杭州市',school:'浙江大学',degree:'本科',major:'计算机科学与技术',eduStart:'2020.09',eduEnd:'2024.06',majorCourses:'数据结构、操作系统、计算机网络',selfEval:'深度互联网从业人员，具备很强的产品规划与需求分析能力。善于沟通，贴近用户。',languages:'普通话标准流利；英语CET-6',campusExp:'学生会干事 | 浙江大学学生会\n• 参与组织策划校园文化节等大型活动\n• 锻炼了组织协调能力',experiences:[{company:'XX科技',title:'研发实习生',start:'2023.06',end:'2023.09',descs:['参与核心产品后端模块设计与开发','独立完成3个功能模块编码与测试']}],skills:['Java/Python编程','Office套件','MySQL数据库'],certs:['计算机二级','CET-6']};
  document.getElementById('tpl-preview-name').textContent=tpl.name+' - 预览';
  document.getElementById('tpl-preview-content').innerHTML=buildResumeHTML(sample,tpl);
  document.getElementById('tpl-preview-content').className='resume-page sidebar-left';
  injectTemplateColors(tpl, document.getElementById('tpl-preview-content'));
  document.getElementById('template-preview-modal').style.display='flex';
  document.getElementById('tpl-apply-btn').onclick=function(){state.selectedTemplate=id;updateTemplateSelector();var at=document.querySelector('#template-tabs .tab.active');renderTemplateGrid(at?at.dataset.cat:'all');closeTemplatePreview();showToast('已应用模板：'+escHtml(tpl.name));if(state.generator.initialized)renderGeneratedResume();};
}
function closeTemplatePreview(){document.getElementById('template-preview-modal').style.display='none';}

document.getElementById('template-tabs').addEventListener('click',function(e){var tab=e.target.closest('.tab');if(!tab)return;document.querySelectorAll('#template-tabs .tab').forEach(function(t){t.classList.remove('active');});tab.classList.add('active');renderTemplateGrid(tab.dataset.cat);});

// Import/Export
function showImportModal(){document.getElementById('import-modal').style.display='flex';}
function closeImportModal(){document.getElementById('import-modal').style.display='none';}
function handleImportFile(e){var f=e.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(ev){document.getElementById('import-json-text').value=ev.target.result;};r.readAsText(f);}
function importTemplateFromJSON(){
  var text=document.getElementById('import-json-text').value.trim();if(!text){showToast('请粘贴JSON','error');return;}
  try{var tpls=JSON.parse(text);if(!Array.isArray(tpls))tpls=[tpls];var im=0;tpls.forEach(function(t){if(!t.id||!t.name){showToast('缺少id/name','error');return;}var ex=state.templates.library.concat(state.templates.imported).find(function(x){return x.id===t.id;});if(ex){showToast('"'+t.name+'"已存在','error');return;}state.templates.imported.push(t);im++;});if(im>0){localStorage.setItem('resumepro-imported-templates',JSON.stringify(state.templates.imported));updateTemplateSelector();closeImportModal();renderTemplateGrid();showToast('成功导入'+im+'个模板');}}catch(e){showToast('JSON格式错误','error');}
}
function exportTemplates(){if(state.templates.imported.length===0){showToast('没有自定义模板','error');return;}var b=new Blob([JSON.stringify(state.templates.imported,null,2)],{type:'application/json'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='resume-templates.json';a.click();URL.revokeObjectURL(u);showToast('已导出');}

// Drag drop
var dz=document.getElementById('import-drop-zone');
if(dz){dz.addEventListener('dragover',function(e){e.preventDefault();dz.classList.add('dragover');});dz.addEventListener('dragleave',function(){dz.classList.remove('dragover');});dz.addEventListener('drop',function(e){e.preventDefault();dz.classList.remove('dragover');var f=e.dataTransfer.files[0];if(f){var r=new FileReader();r.onload=function(ev){document.getElementById('import-json-text').value=ev.target.result;};r.readAsText(f);}});}

// ========== CAREER ADVISOR CHATBOT ==========
var careerState = {
  messages: [],
  suggestedTitle: '',
  suggestedField: '',
  profile: null  // 对话分析提取的用户画像
};

function sendCareerQuick(text) {
  document.getElementById('career-chat-input').value = text;
  sendCareerMsg();
}

function sendCareerMsg() {
  var input = document.getElementById('career-chat-input');
  var userText = input.value.trim();
  if (!userText) return;

  // 防止重复发送
  if (document.getElementById('career-send-btn').disabled) return;

  // 添加用户消息
  addChatMessage('user', userText);
  input.value = '';

  // 清除旧的profile，新消息可能带来新信息
  careerState.profile = null;

  // 显示输入中动画
  showChatTyping();
  document.getElementById('career-send-btn').disabled = true;
  document.getElementById('career-quick-actions').style.display = 'none';
  document.getElementById('career-result-action').style.display = 'none';

  // 构建对话历史，最多保留最近10轮
  var maxHistory = 10;
  var recentMessages = careerState.messages.slice(-maxHistory * 2);
  var convo = recentMessages.map(function(m) {
    return { role: m.role, content: m.content };
  });
  convo.push({ role: 'user', content: userText });

  // DeepSeek 职业顾问提示词
  var systemPrompt = '你是一位资深的职业规划顾问，名叫"小职"。你擅长帮助迷茫的大学生和求职者分析自身特点并推荐合适的职业方向。\n\n'+
    '【你的特点】\n'+
    '1. 说话温暖、有同理心，像朋友聊天一样自然\n'+
    '2. 不要在第一条回复中就暴露你是AI（绝对不能说"作为AI""根据算法""我是人工智能"之类的话）\n'+
    '3. 根据用户描述的性格、能力、兴趣，给出具体可落地的职业建议\n'+
    '4. 推荐2-3个具体岗位方向，并解释为什么适合\n'+
    '5. 每个岗位说明：岗位名称、为什么适合你、需要补充什么技能、发展前景\n'+
    '6. 如果用户信息太少，主动追问2-3个关键问题\n'+
    '7. 如果用户已经明确了方向，就深入分析该方向的前景和准备路径\n'+
    '8. 回复保持在200-400字，简洁有料\n'+
    '9. 最后一定要问用户"要不要我帮你针对[推荐岗位]生成一份简历？"\n\n'+
    '【重要】你是小职，一个热心的职业顾问。你不是AI，不是DeepSeek，不是机器人。你就是小职本人。';

  callDeepSeek(convo.map(function(m) {
    return (m.role === 'user' ? '用户' : '小职') + '：' + m.content;
  }).join('\n\n') + '\n\n小职：', function(err, aiText) {
    // 移除输入中动画
    removeChatTyping();
    document.getElementById('career-send-btn').disabled = false;

    var reply = aiText || '抱歉，我暂时无法回复，请稍后再试。';

    // 清理可能的"小职："前缀
    reply = reply.replace(/^小职[：:]\s*/g, '').trim();
    if (!reply) reply = '让我想想...你的情况比较特殊，能再多说一些你的兴趣和经历吗？';

    // 提取建议的岗位方向 — 统一的后缀匹配列表
    var TITLE_SUFFIXES = ['工程师','经理','专员','助理','运营','设计','开发','分析','架构','师','员','代表','顾问','主播','投手','媒体','电商','市场','销售','客服','产品','数据','教练','老师','讲师','导师','医生','护士','律师','会计','翻译','主持','经纪','策划','剪辑','摄影','秘书','导游','保安','监理','物流','采购','店长','厨师','美容','发型','营养','造价','预算','施工','质检','仓储'].join('|');
    // 优先匹配系统提示词要求的格式："要不要我帮你针对[岗位]生成一份简历？"
    var titleMatch = reply.match(new RegExp('针对[「"""]?([一-龥a-zA-Z+]{2,16}(?:' + TITLE_SUFFIXES + '))[」"""]?'));
    if (!titleMatch) titleMatch = reply.match(new RegExp('(?:推荐|建议).*(?:岗位|方向|职位)[：:\\s]*[是为]?[「"“]?([一-龥a-zA-Z+]{2,12}(?:' + TITLE_SUFFIXES + '))[」"”]?'));
    if (titleMatch) {
      careerState.suggestedTitle = titleMatch[1];
      careerState.suggestedField = titleMatch[1];
    }
    // 匹配"针对[岗位]生成简历"或"帮你生成[岗位]"模式
    if (!careerState.suggestedTitle) {
      var genMatch = reply.match(/(?:针对|帮你|为你|给你).{0,8}(?:生成|写|做|制作|准备).{0,6}(?:简历|求职)/);
      if (genMatch) {
        var innerMatch = genMatch[0].match(new RegExp('(?:针对|帮你|为你|给你)[「"""]?([一-龥a-zA-Z+]{2,16}(?:' + TITLE_SUFFIXES + '))[」"""]?'));
        if (innerMatch) careerState.suggestedTitle = innerMatch[1];
      }
    }
    // 更宽松的中文匹配 — 前缀词+后缀匹配
    if (!careerState.suggestedTitle) {
      var PREFIXES = ['运营','开发','设计','工程','产品','市场','销售','数据','媒体','客服','人力','财务','行政','分析','跨境','出海','芯片','硬件','嵌入','算法','大模型','AIGC','广告','室内','平面','UI','UX','前端','后端','全栈','测试','游戏','电商','直播','短视频','内容','文案','策划','招聘','培训','薪酬','绩效','员工','组织','战略','品牌','公关','媒介','活动','社群','渠道','商务','采购','物流','仓储','供应链','质量','安全','环保','医疗','教育','培训','健身','美容','餐饮','酒店','旅游','保险','金融','证券','基金','期货','理财','法务','合规','审计','税务','外贸','跟单','销售','市场','品牌','产品','研发','供应','计划','采购','质量','体系','行政','人力','财务','IT','法务','合规','内控','审计','咨询','顾问','实施','运维','测试','开发','算法','研究','科学','工程','架构','专家','总监','经理','主管','组长','主任'];
      var prefixStr = PREFIXES.join('|');
      var altMatch = reply.match(new RegExp('([一-龥a-zA-Z]{2,4}(?:' + prefixStr + '))(?:' + TITLE_SUFFIXES + ')?'));
      if (altMatch) careerState.suggestedTitle = altMatch[0];
    }
    // 英文岗位匹配兜底
    if (!careerState.suggestedTitle) {
      var engMatch = reply.match(/(?:recommend|suggest|suitable|fit|match).*?([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2}(?:Engineer|Manager|Specialist|Developer|Designer|Analyst|Consultant|Tester|Writer|Coordinator|Assistant))/i);
      if (!engMatch) engMatch = reply.match(/\b(Data\s?(?:Analyst|Engineer|Scientist)|Software\s?(?:Engineer|Developer)|QA\s?(?:Engineer|Tester)|UX\s?(?:Designer|Researcher)|Product\s?Manager|Project\s?Manager|Marketing\s?(?:Specialist|Manager)|Content\s?(?:Creator|Strategist)|Frontend\s?Developer|Backend\s?Developer|Full[\s-]Stack\s?Developer|AIGC\s?(?:Engineer|Developer)|Prompt\s?(?:Engineer|Developer)|LLM\s?(?:Engineer|Developer)|Chip\s?(?:Design|Engineer)|Embedded\s?(?:Engineer|Developer)|TikTok\s?(?:Operator|Specialist)|Live\s?(?:Stream|Commerce)\s?(?:Host|Operator|Manager))/i);
      if (engMatch) careerState.suggestedTitle = engMatch[0];
    }

    // 清理岗位名称：去掉"或XX"多选项
    if (careerState.suggestedTitle) {
      careerState.suggestedTitle = careerState.suggestedTitle.replace(/[或或者].{1,20}$/, '');
      careerState.suggestedTitle = careerState.suggestedTitle.replace(/^[，,、\s]+|[，,、\s]+$/g, '').trim();
      if (careerState.suggestedTitle.length > 15) careerState.suggestedTitle = careerState.suggestedTitle.substring(0, 15);
    }

    addChatMessage('bot', reply);

    // 如果检测到岗位建议，显示"生成简历"按钮
    if (careerState.suggestedTitle) {
      document.getElementById('career-result-action').style.display = 'block';
      document.getElementById('career-result-action').innerHTML =
        '<button class="btn btn-primary btn-lg" onclick="applyCareerSuggestion()">✨ 为「'+escHtml(careerState.suggestedTitle)+'」方向生成简历</button>';
    }

    // 保存到state
    careerState.messages.push({ role: 'user', content: userText });
    careerState.messages.push({ role: 'assistant', content: reply });
  }, 'pro', systemPrompt);
}

function addChatMessage(type, text) {
  var container = document.getElementById('career-chat-messages');
  var div = document.createElement('div');
  div.className = 'chat-msg ' + type;
  // 将**text**转为<strong>
  var html = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');
  div.innerHTML = '<div class="chat-avatar">' + (type === 'user' ? '👤' : '🤖') + '</div><div class="chat-bubble">' + html + '</div>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showChatTyping() {
  var container = document.getElementById('career-chat-messages');
  var div = document.createElement('div');
  div.className = 'chat-msg bot';
  div.id = 'chat-typing-indicator';
  div.innerHTML = '<div class="chat-avatar">🤖</div><div class="chat-bubble"><div class="chat-typing"><span></span><span></span><span></span></div></div>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function removeChatTyping() {
  var el = document.getElementById('chat-typing-indicator');
  if (el) el.remove();
}

// ========== CAREER CONVERSATION ANALYSIS ==========
// 分析整个对话，提取结构化用户画像（用Flash模型，快速+省钱）
function analyzeCareerConversation(callback) {
  var convo = careerState.messages;
  if (convo.length === 0) { callback(null); return; }

  var analysisPrompt = '你是一个信息提取专家。分析以下用户与职业顾问的完整对话，提取用户的所有信息。\n\n' +
    '对话：\n' +
    convo.map(function(m) {
      return (m.role === 'user' ? '用户' : '顾问') + '：' + m.content;
    }).join('\n\n') + '\n\n' +
    '只返回JSON（不要```json标记，不要任何解释）：\n' +
    '{\n' +
    '  "name":"姓名（未提及为空）",\n'+
    '  "title":"求职意向岗位",\n'+
    '  "school":"学校",\n'+
    '  "major":"专业",\n'+
    '  "degree":"学历（大专/本科/硕士/博士，未提及为空）",\n'+
    '  "phone":"手机号",\n'+
    '  "email":"邮箱",\n'+
    '  "location":"城市",\n'+
    '  "skills":["技能"],\n'+
    '  "interests":["兴趣"],\n'+
    '  "strengths":["优势特点"],\n'+
    '  "preferredFields":["偏好方向"],\n'+
    '  "completenessScore":0-100,\n'+
    '  "missingCritical":["关键信息缺失项（仅限：姓名、求职意向、学校、专业、学历。手机号/邮箱/城市不算关键信息），如无则为空数组"],\n'+
    '  "missingRecommended":["建议补充的信息"],\n'+
    '  "summaryForGenerator":"一段100字内的中文描述：我叫[姓名]，[学校][专业][学历]，求职意向[岗位]。特点是[优势]。有[技能]经验。"\n'+
    '}';

  callDeepSeek(analysisPrompt, function(err, text) {
    if (err || !text) { callback(null); return; }
    try {
      var jsonStr = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
      var p = JSON.parse(jsonStr);
      p.name = p.name || ''; p.title = p.title || careerState.suggestedTitle || '';
      p.school = p.school || ''; p.major = p.major || ''; p.degree = p.degree || '';
      p.phone = p.phone || ''; p.email = p.email || ''; p.location = p.location || '';
      p.skills = p.skills || []; p.interests = p.interests || [];
      p.strengths = p.strengths || []; p.preferredFields = p.preferredFields || [];
      p.completenessScore = typeof p.completenessScore === 'number' ? p.completenessScore : 0;
      p.missingCritical = p.missingCritical || [];
      p.missingRecommended = p.missingRecommended || [];
      p.summaryForGenerator = p.summaryForGenerator || '';
      callback(p);
    } catch(e) { callback(null); }
  });
}

// 从profile构建生成器输入（当AI没生成summary时的fallback）
function buildSummaryFromProfile(profile) {
  var parts = [];
  if (profile.name) parts.push('我叫' + profile.name);
  if (profile.school) {
    var edu = profile.school + (profile.major||'') + (profile.degree||'');
    parts.push('毕业于' + edu);
  }
  if (profile.title) parts.push('想找' + profile.title + '的工作');
  if (profile.skills.length > 0) parts.push('具备' + profile.skills.join('、') + '等技能');
  if (profile.strengths.length > 0) parts.push('优势：' + profile.strengths.join('、'));
  return parts.join('。\n');
}

// 信息不足时显示引导消息
function showProfileGapMessage(profile) {
  var msg = '📋 **对话分析结果**\n\n';
  var hasInfo = false;
  if (profile.name)     { msg += '✅ 姓名：' + profile.name + '\n'; hasInfo = true; }
  if (profile.title)    { msg += '✅ 求职意向：' + profile.title + '\n'; hasInfo = true; }
  if (profile.school)   { msg += '✅ 学校：' + profile.school + '\n'; hasInfo = true; }
  if (profile.major)    { msg += '✅ 专业：' + profile.major + '\n'; hasInfo = true; }
  if (profile.skills.length > 0) { msg += '✅ 技能：' + profile.skills.join('、') + '\n'; hasInfo = true; }
  if (profile.strengths.length > 0) { msg += '✅ 优势：' + profile.strengths.join('、') + '\n'; hasInfo = true; }

  if (!hasInfo) {
    msg += '⚠️ 从对话中未能提取到足够的个人信息。\n\n';
  }

  var missing = profile.missingCritical.concat((profile.missingRecommended||[]).slice(0, 2));
  if (missing.length > 0) {
    msg += '\n⚠️ **还需要补充：**\n';
    missing.forEach(function(m) { msg += '• ' + m + '\n'; });
  }

  msg += '\n💡 信息越完整，生成的简历越精准。请在下方输入框中补充信息，然后重新点击生成。';

  addChatMessage('bot', msg);
  document.getElementById('career-result-action').style.display = 'none';

  // 让用户可以重新尝试
  setTimeout(function() {
    var actionEl = document.getElementById('career-result-action');
    if (actionEl) {
      actionEl.style.display = 'block';
      actionEl.innerHTML = '<button class="btn btn-primary btn-lg" onclick="applyCareerSuggestion()">🔄 重新分析并生成简历</button>';
    }
  }, 800);
}

function applyCareerSuggestion() {
  // 隐藏之前的action按钮，防止重复点击
  document.getElementById('career-result-action').style.display = 'none';
  showToast('正在分析对话内容...', 'info');

  analyzeCareerConversation(function(profile) {
    if (!profile) {
      showToast('分析失败，请重试', 'error');
      document.getElementById('career-result-action').style.display = 'block';
      return;
    }

    careerState.profile = profile;

    // 信息不足：缺少关键字段（姓名+求职意向+学校）且评分<30
    var missingCritical = profile.missingCritical || [];
    if (profile.completenessScore < 20 || missingCritical.length >= 3) {
      showProfileGapMessage(profile);
      return;
    }

    // 信息足够 → 跳转到生成器
    // 清除引导卡片
    dismissJobTargetGuidance();

    switchSection('generator');
    state.generator.step = 1;
    updateGeneratorSteps(1);

    // 如果是从生成器跳转过来的，合并原始输入和分析结果
    var input = document.getElementById('gen-free-input');
    if (careerState.fromGenerator) {
      var genInput = careerState.generatorInput || '';
      // 将分析得到的岗位方向添加到原始信息中
      var mergedInput = genInput;
      if (profile.title && genInput.indexOf(profile.title) === -1) {
        mergedInput += '\n求职意向：' + profile.title;
      }
      if (profile.skills && profile.skills.length > 0) {
        var newSkills = profile.skills.filter(function(s) { return genInput.indexOf(s) === -1; });
        if (newSkills.length > 0) mergedInput += '\n技能：' + newSkills.join('、');
      }
      input.value = mergedInput;
      careerState.fromGenerator = false;
      careerState.generatorInput = '';
    } else {
      input.value = profile.summaryForGenerator || buildSummaryFromProfile(profile);
    }
    switchGenMode('free');
    input.scrollIntoView({ behavior: 'smooth' });

    var titleMsg = profile.title || careerState.suggestedTitle || '';
    showToast('已分析对话并预填信息' + (titleMsg ? '（' + titleMsg + '方向）' : '') + '，点击生成简历即可');
  });
}

// ========== UTILS ==========
function escHtml(s){if(!s)return'';var d=document.createElement('div');d.textContent=s;return d.innerHTML;}

// ========== AUTO-SAVE GENERATOR STATE ==========
function saveGeneratorDraft() {
  try {
    var g = state.generator;
    var draft = {
      name: g.name, title: g.title, phone: g.phone, email: g.email, location: g.location,
      school: g.school, major: g.major, degree: g.degree, eduStart: g.eduStart, eduEnd: g.eduEnd, majorCourses: g.majorCourses,
      selfEval: g.selfEval, languages: g.languages, campusExp: g.campusExp,
      experiences: g.experiences,
      skills: g.skills, certs: g.certs
    };
    localStorage.setItem('resumepro-generator-draft', JSON.stringify(draft));
  } catch(e) {/* ignore storage errors */}
}
function loadGeneratorDraft() {
  try {
    var data = localStorage.getItem('resumepro-generator-draft');
    if (!data) return false;
    var draft = JSON.parse(data);
    // 检查是否有实质内容
    var hasContent = draft.name || draft.title || draft.school || draft.major ||
      (draft.experiences && draft.experiences.length > 0 && draft.experiences[0].company);
    if (!hasContent) return false;
    var g = state.generator;
    Object.keys(draft).forEach(function(k) { if (draft[k] !== undefined) g[k] = draft[k]; });
    return true;
  } catch(e) { return false; }
}
function restoreGeneratorDraft() {
  switchSection('generator');
  state.generator.mode = 'free';
  switchGenMode('free');
  var restoredText = [];
  var g = state.generator;
  if (g.name) restoredText.push('我叫' + g.name);
  if (g.school) restoredText.push('毕业于' + g.school + (g.major || ''));
  if (g.title) restoredText.push('想找' + g.title + '的工作');
  document.getElementById('gen-free-input').value = restoredText.join('，');
  showToast('已恢复上次的草稿');
}
function clearGeneratorDraft() {
  localStorage.removeItem('resumepro-generator-draft');
}

// ========== KEYBOARD SHORTCUTS ==========
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') { closeImportModal(); closeTemplatePreview(); }
  // Ctrl+Enter shortcuts
  if (e.ctrlKey && e.key === 'Enter') {
    var active = document.activeElement;
    if (!active) return;
    // 优化器
    if (active.id === 'opt-input' || active.id === 'opt-jd') { e.preventDefault(); runOptimization(); return; }
    // 生成器自由输入
    if (active.id === 'gen-free-input') { e.preventDefault(); handleFreeInput(); return; }
    // 职业聊天
    if (active.id === 'career-chat-input') { e.preventDefault(); sendCareerMsg(); return; }
  }
});

// ========== INIT ==========
document.addEventListener('DOMContentLoaded',function(){
  loadTemplates();
  if (loadGeneratorDraft()) {
    // 延迟显示恢复提示，避免和模板加载 toast 冲突
    setTimeout(function() {
      showToast('检测到未完成的简历草稿');
      // 添加恢复按钮到页面
      var btn = document.createElement('button');
      btn.className = 'btn btn-primary btn-sm';
      btn.textContent = '恢复草稿';
      btn.onclick = restoreGeneratorDraft;
      btn.style.cssText = 'position:fixed;bottom:130px;left:50%;transform:translateX(-50%);z-index:300;box-shadow:0 8px 32px rgba(0,0,0,.15)';
      document.body.appendChild(btn);
      setTimeout(function() { if (btn.parentNode) btn.remove(); }, 10000);
    }, 800);
  }
  // 向导步骤5 → 预览就保存草稿
  var origNext = generatorNext;
  window.generatorNext = function(step) {
    if (step === 4) saveGeneratorDraft();
    origNext(step);
  };
});

