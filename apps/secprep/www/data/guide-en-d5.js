// Study guide, Domain 5: Security Program Management and Oversight (original text).
window.SECPREP_GUIDE = window.SECPREP_GUIDE || { chapters: [] };
window.SECPREP_GUIDE.chapters.push(
{id:"5.1",d:5,t:"Security governance",min:11,
intro:"Governance is how an organization decides, documents and checks its security. It connects business goals to the controls you have studied.",
s:[
["Policies, standards, procedures and guidelines","**Policies** are high-level, mandatory statements of what must happen: an acceptable use policy (AUP), information security policy, business continuity, disaster recovery, incident response, software development lifecycle and change management policies. **Standards** set specific requirements, such as password length or encryption algorithms. **Procedures** are step-by-step instructions, like onboarding and offboarding or a change management procedure, and **playbooks** for incidents. **Guidelines** are recommended practice, not mandatory.",
["Policy: what and why (mandatory)","Standard: exact requirements","Procedure: how, step by step","Guideline: recommended, optional"]],
["External considerations and monitoring","Governance must account for **regulatory**, **legal**, **industry**, **local or regional**, **national** and **global** requirements. Policies are reviewed and revised regularly, monitored for compliance and updated after incidents or business changes."],
["Governance structures","**Boards** and **committees** set direction and oversee risk. **Government entities** impose rules. **Centralized** governance gives consistency; **decentralized** governance gives business units flexibility."],
["Data roles","The **owner** is accountable for a data set and decides its classification (usually a senior business leader). The **controller** decides why and how personal data is processed; the **processor** processes it on the controller's behalf. The **custodian or steward** handles day-to-day care, such as backups and access settings."]],
terms:[["AUP","Acceptable use policy: rules for using company systems"],["Data owner","Accountable for the data and its classification"],["Data custodian","Implements daily controls on the data"],["Data controller","Decides the purposes of processing personal data"]],
ex:"A company's policy says customer data must be encrypted. The encryption standard requires AES-256. The procedure walks admins through enabling encryption on a new database. A guideline suggests rotating keys yearly. Four documents, four levels of detail.",
tip:"Policy says what, procedure says how, guideline suggests.",
vid:null, ck:["Policy","Procedure","Acceptable use","Data custodian","Data owner","controller","Centralized"]},

{id:"5.2",d:5,t:"Risk management",min:14,
intro:"Risk management decides which risks to fix, which to accept and how much to spend. It is the one place on the exam where you must do simple math.",
s:[
["Identifying and assessing risk","Risk assessments can be **ad hoc**, **recurring**, **one-time** or **continuous**. **Qualitative** analysis rates risks as high, medium or low using judgment. **Quantitative** analysis uses numbers and money. **Inherent risk** exists before controls; **residual risk** is what remains after them."],
["The risk math","**Single loss expectancy (SLE)** = asset value (AV) × exposure factor (EF). The exposure factor is the percentage of value lost in one incident.\n\n**Annualized rate of occurrence (ARO)** is how often the incident is expected per year: once every two years is 0.5.\n\n**Annualized loss expectancy (ALE)** = SLE × ARO. If a control costs less per year than the ALE it removes, it is usually worth buying.",
["SLE = AV × EF","ALE = SLE × ARO","Example: AV 100,000 × EF 40% = SLE 40,000; ARO 0.5 → ALE 20,000"]],
["Treating risk","**Transfer** shifts the financial impact, for example with cyber insurance. **Accept** means consciously living with it, sometimes through a documented **exemption** or **exception**. **Avoid** means stopping the risky activity. **Mitigate** means adding controls to reduce it."],
["Tracking risk","A **risk register** lists risks, their owners, ratings and treatment. **Key risk indicators (KRIs)** are early-warning metrics, such as rising failed logins. **Risk appetite** is how much risk the organization is willing to take in pursuit of goals (expansionary, conservative or neutral); **risk tolerance** is the acceptable variation around it; a **risk threshold** is the point where action is required."],
["Business impact analysis","A **BIA** identifies critical business functions and the impact of losing them. It sets the **RTO** and **RPO** (chapter 3.4), and uses reliability metrics: **mean time to repair (MTTR)** and **mean time between failures (MTBF)**."]],
terms:[["SLE","Loss from one incident: AV × EF"],["ALE","Expected yearly loss: SLE × ARO"],["Residual risk","Risk left after controls"],["Risk register","Living list of risks and their treatment"],["MTBF","Average time a system runs between failures"]],
ex:"A laptop holding sales data is worth 5,000 in hardware and data. Losing one costs about 80% of that (EF), so SLE is 4,000. The company loses about 10 laptops a year (ARO 10), so ALE is 40,000. Full-disk encryption for all laptops costs 6,000 a year and removes most of the data loss, so it is clearly worth it.",
tip:"Write the two formulas at the top of your scratch paper before the exam starts: SLE = AV × EF, ALE = SLE × ARO.",
vid:"v-risk", ck:["single loss","annualized loss","Transfer","Avoid","Accept","Risk register","Qualitative","Business impact","MTBF","Residual","appetite","Key risk"]},

{id:"5.3",d:5,t:"Third-party risk",min:9,
intro:"Your security is only as strong as your weakest vendor. Third-party risk management checks partners before and after you sign with them.",
s:[
["Assessing vendors","Methods include **penetration testing** of the vendor, a **right-to-audit clause** in the contract, **evidence of internal audits**, **independent assessments** such as SOC 2 reports, and **supply chain analysis**. Before signing, perform **due diligence** and check for **conflicts of interest**."],
["Agreement types","A **service level agreement (SLA)** sets measurable performance, like 99.9% uptime. A **memorandum of agreement or understanding (MOA/MOU)** records an intent to cooperate, with fewer legal penalties. A **master service agreement (MSA)** sets general terms for future work, and each project is detailed in a **work order or statement of work (WO/SOW)**. A **non-disclosure agreement (NDA)** protects confidential information. A **business partners agreement (BPA)** defines how partners share profits, losses and responsibilities."],
["Ongoing oversight","Monitor vendors throughout the relationship with **questionnaires**, reviews and performance checks. Agree on **rules of engagement** before any testing of their systems."]],
terms:[["SLA","Measurable service levels a vendor must meet"],["MSA","Umbrella contract for future work"],["SOW","Detailed scope of one project"],["Right-to-audit","Contract clause allowing you to inspect a vendor's controls"]],
ex:"Before moving payroll to a cloud provider, a company reviews the provider's SOC 2 report, adds a right-to-audit clause and a 99.95% uptime SLA, and signs an NDA. Each year it sends a security questionnaire to confirm nothing has slipped.",
tip:"SLA = numbers and uptime. MOU = intent. MSA = umbrella. SOW = one specific job.",
vid:null, ck:["Service level","Right-to-audit","Master service","Memorandum","Non-disclosure","due diligence"]},

{id:"5.4",d:5,t:"Security compliance",min:9,
intro:"Compliance means meeting the laws, regulations and contracts that apply to you, and being able to prove it.",
s:[
["Reporting and consequences","Compliance reporting can be **internal** or **external** (to regulators or partners). Failing to comply can bring **fines**, **sanctions**, **reputational damage**, **loss of license** and **contractual impacts**. **Due diligence** and **due care** show that the organization took reasonable steps. **Attestation and acknowledgement** document that people know and accept the rules. Compliance is also monitored internally and externally, often with **automation**."],
["Privacy","Privacy laws can be **local or regional**, **national** or **global**. Under GDPR-style laws, the **data subject** is the person the data is about, the **controller** decides how it is used and the **processor** handles it for the controller. Data subjects have rights such as the **right to be forgotten** (erasure). Organizations keep a **data inventory** and a **retention** schedule. **PCI DSS** applies to anyone handling payment card data."]],
terms:[["Data subject","The person the personal data describes"],["Right to be forgotten","Right to have personal data erased"],["PCI DSS","Security standard for payment card data"],["Due care","Ongoing effort to maintain security"]],
ex:"A customer asks an online store to delete all their personal data. Under GDPR the store, as controller, must erase it and instruct its email marketing processor to delete it too, unless another law requires keeping it.",
tip:"Controller decides, processor processes, subject is the person.",
vid:null, ck:["data controller","Right to be forgotten","PCI DSS","GDPR"]},

{id:"5.5",d:5,t:"Audits and assessments",min:9,
intro:"Audits and assessments check whether controls actually work. Penetration tests go further and try to break in.",
s:[
["Attestation and audits","**Attestation** is a formal statement that controls meet a standard. **Internal** audits include compliance checks, the **audit committee** and **self-assessments**. **External** audits are done by **regulators**, **independent third parties** or for **examinations** and **assessments**."],
["Penetration testing","Pen tests can be **physical**, **offensive** (red team), **defensive** (blue team) or **integrated** (purple team, both working together). By knowledge given to testers: **known environment** (full information, formerly white box), **partially known** (some information, gray box) and **unknown environment** (no information, black box)."],
["Reconnaissance","**Passive reconnaissance** gathers information without touching the target, such as searching social media, job posts and public records (OSINT). **Active reconnaissance** interacts with the target, such as port scanning or probing services."]],
terms:[["Known environment","Testers receive full information"],["Unknown environment","Testers receive no information"],["Passive reconnaissance","Information gathering without contacting the target"],["Purple team","Attackers and defenders working together"]],
ex:"A bank hires testers and gives them nothing but its company name. They study employees on social media (passive), then scan the bank's public IP ranges (active), and finally talk their way into a branch's back office (physical). It is an unknown-environment test.",
tip:"No information given = unknown environment. Full diagrams and code given = known environment.",
vid:null, ck:["Known environment","Passive reconnaissance","External audit","attestation"]},

{id:"5.6",d:5,t:"Security awareness",min:8,
intro:"People are both the most targeted part of security and one of the best sensors. Awareness programs turn employees into defenders.",
s:[
["Phishing awareness","Run **phishing campaigns** that send realistic test emails, teach people to **recognize** warning signs, and make it easy to **respond** by reporting suspicious messages with one click."],
["Recognizing anomalous behavior","Teach staff to notice behavior that is **risky**, **unexpected** or **unintentional**, such as a colleague asking for passwords, a USB stick left in a meeting room, or files suddenly encrypted."],
["User guidance and training","Cover **policies and handbooks**, **situational awareness**, **insider threat** signs, **password management**, **removable media and cables**, **social engineering**, **operational security**, and safe **hybrid and remote work** practices."],
["Running the program","Make reporting easy and blame-free, track results such as click and report rates, and keep content **initial** (at onboarding) and **recurring** (regular refreshers). Development and execution should be measured and improved over time."]],
terms:[["Phishing campaign","Simulated phishing to measure and train staff"],["Anomalous behavior","Activity that does not fit normal patterns"],["Operational security","Protecting everyday information from leaking"]],
ex:"After six months of monthly phishing simulations with quick feedback, a company's click rate drops from 18% to 4% and its report rate rises from 5% to 60%. Employees are now catching real phishing emails before the security team does.",
tip:"The goal of awareness training is to change behavior, not just to meet a requirement.",
vid:null, ck:["phishing simulation","awareness","Tabletop"]}
);
