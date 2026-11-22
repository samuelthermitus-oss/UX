// Study guide, Domain 4: Security Operations (original text).
window.SECPREP_GUIDE = window.SECPREP_GUIDE || { chapters: [] };
window.SECPREP_GUIDE.chapters.push(
{id:"4.1",d:4,t:"Securing computing resources",min:12,
intro:"Every device on your network needs a known, hardened starting point and ongoing care. This chapter covers baselines, hardening, wireless, mobile and application security.",
s:[
["Secure baselines","A **secure baseline** is the approved configuration for a type of system. You **establish** it (often from CIS Benchmarks or vendor guides), **deploy** it to every new system, and **maintain** it by checking for drift and updating it as threats change."],
["Hardening targets","Harden **mobile devices**, **workstations**, **switches**, **routers**, **cloud infrastructure**, **servers**, **ICS/SCADA**, **embedded systems**, **RTOS** and **IoT** devices. The steps are similar everywhere: change defaults, remove what you do not need, patch, restrict access and log activity."],
["Wireless","Plan coverage with a **site survey** and **heat maps** so the signal reaches where it should and not far beyond. Use **WPA3**, which replaces the pre-shared key handshake with **SAE** (Simultaneous Authentication of Equals) to resist offline password guessing. In businesses, use **802.1X** with a **RADIUS** server so each user authenticates individually. **EAP-TLS** uses certificates on both the server and the client and is the strongest common method."],
["Mobile devices","**Mobile device management (MDM)** enforces passcodes, encryption and app policies, and can remotely wipe a lost phone. Deployment models: **BYOD** (employees bring their own), **COPE** (company-owned, personally enabled), and **CYOD** (choose your own from an approved list). Connection methods to secure include cellular, Wi-Fi and Bluetooth."],
["Application security","Apps should do **input validation** on everything they receive, use **secure cookies** (Secure and HttpOnly flags), and be checked by **static code analysis** before release. **Code signing** proves software comes from the stated developer and has not been altered. **Sandboxing** runs untrusted code in isolation, and **monitoring** watches for abnormal behavior."]],
terms:[["Secure baseline","Approved, hardened configuration for a system type"],["SAE","WPA3's handshake that resists offline dictionary attacks"],["EAP-TLS","Certificate-based mutual authentication for networks"],["COPE","Company-owned device that also allows personal use"]],
ex:"A new branch office gets 40 laptops. Instead of setting each one up by hand, IT pushes the corporate baseline: disk encryption on, local admin removed, firewall enabled, unused services off. Monthly scans flag any laptop that drifts from the baseline.",
tip:"WPA3 equals SAE. Certificates on both sides equals EAP-TLS.",
vid:null, ck:["baseline","Mobile device management","COPE","WPA3","EAP-TLS","Code signing","Sandboxing","Static analysis","Fuzzing"]},

{id:"4.2",d:4,t:"Asset management",min:8,
intro:"You cannot protect what you do not know you have. Asset management tracks hardware, software and data from purchase to disposal.",
s:[
["Acquisition and ownership","Security starts at **acquisition and procurement**: buy from trusted sources and check security features before purchase. Every asset gets an **owner** who is accountable for it and a **classification** that sets how it must be protected."],
["Monitoring and tracking","An **inventory** lists every asset; **enumeration** discovers what is actually on the network, including devices nobody registered. Comparing the two finds unknown devices and shadow IT."],
["Disposal and decommissioning","When an asset is retired, its data must be destroyed. **Sanitization** methods include overwriting (wiping) so a drive can be reused, and **degaussing** for magnetic media. **Destruction** includes shredding, drilling and incineration. Get a **certificate of destruction** from any vendor who destroys media for you. Follow **data retention** rules: keep data as long as the law or policy requires, and no longer."]],
terms:[["Enumeration","Discovering what assets actually exist on a network"],["Sanitization","Removing data so it cannot be recovered"],["Certificate of destruction","Proof a vendor destroyed media"]],
ex:"A company sells old servers online without wiping the drives. A buyer finds customer records on them. A simple asset disposal process (wipe, verify, document) would have prevented a reportable breach.",
tip:"Reuse the drive: wipe it. Never reuse it: degauss or physically destroy it.",
vid:null, ck:["Wiping","Certificate of destruction","Deprovisioning","inventory"]},

{id:"4.3",d:4,t:"Vulnerability management",min:11,
intro:"Vulnerability management is a cycle: find weaknesses, decide which matter most, fix them and confirm the fix worked.",
s:[
["Finding vulnerabilities","**Vulnerability scans** check systems for known flaws. A **credentialed** scan logs in and sees missing patches and local settings; a **non-credentialed** scan sees what an outside attacker sees. **Application security** testing includes static analysis (reading the code), dynamic analysis (testing the running app) and package monitoring. **Threat feeds** share fresh information: open-source intelligence (**OSINT**), proprietary feeds, information-sharing organizations and the **dark web**. **Penetration testing**, **responsible disclosure programs** and **bug bounties** bring in human testers."],
["Analysis and prioritization","Confirm each finding: a **false positive** reports a problem that does not exist; a **false negative** misses a real one, which is more dangerous. **CVE** gives each public vulnerability a unique ID, and **CVSS** scores its severity from 0 to 10. Prioritize using the score plus your context: **exposure factor**, environmental variables, industry impact and your **risk tolerance**."],
["Response and validation","Responses include **patching**, buying **insurance**, **segmentation**, **compensating controls**, and documented **exceptions and exemptions** when a fix is not possible yet. Then **validate**: **rescan**, audit and verify that the fix worked. Finally, **report** results to the people who need them."]],
terms:[["CVE","Unique identifier for a public vulnerability"],["CVSS","Severity score from 0 to 10"],["False negative","A real vulnerability the scan missed"],["Credentialed scan","A scan that logs in for deeper visibility"]],
ex:"A scan reports 300 findings. The team filters to internet-facing systems with CVSS 9 or higher and a known exploit, fixes those 12 first, then rescans to confirm. Context-based prioritization turns an overwhelming list into a plan.",
tip:"CVE is the name tag, CVSS is the severity score.",
vid:null, ck:["Credentialed","False positive","CVSS","vulnerability"]},

{id:"4.4",d:4,t:"Security alerting and monitoring",min:10,
intro:"Monitoring turns raw logs into useful alerts. The goal is to notice attacks quickly without drowning in noise.",
s:[
["What to monitor","Monitor **systems**, **applications** and **infrastructure**. Activities include **log aggregation** (collecting logs in one place), **alerting**, **scanning**, **reporting**, **archiving** for later investigations, and **alert response**: quarantine affected systems and tune alerts to reduce false positives."],
["Tools","A **SIEM** collects and correlates logs from many sources and raises alerts when patterns match an attack. **SCAP** is a set of standards for automated configuration and vulnerability checks, and **benchmarks** define secure settings. **Agents** run on hosts and send data; **agentless** tools collect remotely. **Antivirus**, **DLP** (data loss prevention), **SNMP traps**, **NetFlow** and **vulnerability scanners** all feed the picture."]],
terms:[["SIEM","Collects and correlates logs and raises alerts"],["NetFlow","Records who talked to whom, how much and when"],["Alert tuning","Adjusting rules to cut false positives"]],
ex:"A SIEM notices one account fail to log in 40 times across 40 servers in two minutes, then succeed on one. No single log looks scary, but correlated together they reveal password spraying.",
tip:"SIEM sees and correlates. SOAR (chapter 4.7) acts automatically.",
vid:null, ck:["SIEM","NetFlow","SNMP"]},

{id:"4.5",d:4,t:"Enterprise security capabilities",min:13,
intro:"This chapter is a tour of the tools enterprises use to block, detect and control, and when to choose each one.",
s:[
["Firewalls, IDS and IPS","Firewall **rules** use **access lists**, **ports and protocols**, and **screened subnets**. IDS and IPS use **signatures** for known attacks and **trends** or anomalies for unknown ones."],
["Web and DNS filtering","**Web filtering** can be **agent-based** on the device or done by a **centralized proxy**. It uses **URL scanning**, **content categorization**, **block rules** and **reputation**. **DNS filtering** refuses to resolve known malicious domains, stopping connections before they start."],
["Operating system security","**Group Policy** pushes settings to Windows machines centrally. **SELinux** adds mandatory access control to Linux, confining what each process can do."],
["Secure protocols","Choose secure versions and ports: **SSH** (22) instead of Telnet, **HTTPS** (443) instead of HTTP, **SFTP** or FTPS instead of FTP, **LDAPS** (636) instead of LDAP (389), **SNMPv3** instead of v1 or v2c, and **DNSSEC** to protect DNS answers.",
["SSH 22","HTTPS 443","LDAPS 636","RDP 3389","DNS 53","SMTP 25, submission 587"]],
["Email security","**SPF** lists the servers allowed to send mail for a domain. **DKIM** signs messages so receivers can verify they were not altered. **DMARC** tells receivers what to do when SPF or DKIM fails (none, quarantine or reject) and sends reports. An **email gateway** filters spam and malware."],
["More capabilities","**File integrity monitoring (FIM)** alerts when critical files change. **DLP** stops sensitive data from leaving. **Network access control (NAC)** checks devices before they join the network. **EDR** records endpoint activity and can isolate infected hosts; **XDR** extends this across more data sources. **User behavior analytics (UBA)** spots unusual activity for a user."]],
terms:[["DMARC","Policy for mail that fails SPF or DKIM checks"],["FIM","Alerts when important files change"],["NAC","Checks devices before they connect"],["EDR","Endpoint detection and response"]],
ex:"Attackers spoof the company's domain in invoices. The mail team publishes SPF and DKIM, then moves DMARC from none to quarantine and finally reject. Spoofed mail stops landing in customers' inboxes.",
tip:"SPF lists senders, DKIM signs, DMARC decides and reports.",
vid:null, ck:["SPF","DKIM","DMARC","LDAPS","SSH on port","SNMPv3","File integrity","EDR","DLP","SELinux","DNS filtering"]},

{id:"4.6",d:4,t:"Identity and access management",min:14,
intro:"Identity is the new perimeter. This chapter covers how accounts are created and removed, how people sign in, and how access is decided.",
s:[
["Account lifecycle","**Provisioning** creates accounts with the right access; **deprovisioning** removes access promptly when someone leaves or changes role. **Permission assignments** should follow least privilege. **Identity proofing** confirms a person is who they claim before an account is created. **Attestation** is a periodic review where managers confirm their staff still need their access."],
["Federation and single sign-on","**Single sign-on (SSO)** lets users sign in once and reach many apps. **Federation** extends trust between organizations. **SAML** passes authentication assertions in XML between an identity provider and a service. **OAuth** grants delegated authorization with tokens (letting an app act for you without your password). **OpenID Connect** adds authentication on top of OAuth. **LDAP** is the directory protocol behind many corporate logins."],
["Access control models","**Mandatory access control (MAC)** uses labels like Secret and Top Secret set by the system. **Discretionary (DAC)** lets the owner decide who has access. **Role-based (RBAC)** assigns permissions to job roles. **Rule-based** applies rules such as firewall-style conditions. **Attribute-based (ABAC)** evaluates many attributes like department, device, location and time. **Time-of-day restrictions** and least privilege apply across all of them."],
["Multifactor authentication","Factors are **something you know** (password, PIN), **something you have** (phone, security key), **something you are** (fingerprint, face) and **somewhere you are** (location). Implementations include biometrics, **hard tokens**, **soft tokens** like authenticator apps (TOTP codes that change every 30 seconds; HOTP codes advance by counter), and **security keys**. **Passwordless** sign-in with FIDO2 security keys or passkeys resists phishing because the key only works on the real site."],
["Passwords and privileged access","Good password practice favors **length** over forced complexity, avoids reuse, and uses **password managers**. **Privileged access management (PAM)** protects admin accounts with **just-in-time permissions** (access only when needed, for a limited time), **password vaulting** and **ephemeral credentials** that expire quickly."]],
terms:[["SAML","XML-based federation for single sign-on"],["OAuth","Delegated authorization using tokens"],["ABAC","Access decided by many attributes"],["Just-in-time access","Privileges granted only when needed and removed afterward"],["Attestation","Periodic confirmation that access is still needed"]],
ex:"An employee resigns on Friday, but their account stays active for three months and is later used to download files. Automated deprovisioning tied to HR records would have disabled the account the moment employment ended.",
tip:"SAML authenticates with XML; OAuth authorizes with tokens; OpenID Connect adds authentication to OAuth.",
vid:"v-mfa", ck:["SAML","OAuth","Role-based","Attribute-based","Mandatory access","Discretionary","TOTP","FIDO2","Just-in-time","Deprovisioning","Conditional access","fingerprint"]},

{id:"4.7",d:4,t:"Automation and orchestration",min:7,
intro:"Security teams are small and alerts are many. Automation handles repetitive tasks so people can focus on judgment calls.",
s:[
["Use cases","Automate **user provisioning**, **resource provisioning**, **guard rails** that block risky configurations, **security groups**, **ticket creation**, **escalation**, enabling and disabling **services and access**, **continuous integration and testing**, and **API integrations** between tools. **SOAR** platforms run **playbooks**: for example, when an alert fires, isolate the host, reset the user's password and open a ticket, all in seconds."],
["Benefits and risks","Benefits: **efficiency and time saving**, **enforced baselines**, **standard infrastructure configurations**, **scaling securely**, better **employee retention** (less tedious work), faster **reaction time**, and acting as a **workforce multiplier**. Risks: **complexity**, **cost**, a **single point of failure**, **technical debt**, and **ongoing supportability**. A broken script can make the same mistake on a thousand systems at once."]],
terms:[["SOAR","Security orchestration, automation and response"],["Playbook","Predefined automated response steps"],["Guard rail","Automated check that prevents unsafe changes"]],
ex:"Every time a user reports a phishing email, a SOAR playbook pulls the message, checks links against threat feeds, deletes matching emails from all mailboxes and replies to the user. What took an analyst 20 minutes now takes 40 seconds.",
tip:"If the question is about automatically running response steps, the answer is SOAR.",
vid:null, ck:["SOAR","Automation","playbook"]},

{id:"4.8",d:4,t:"Incident response",min:14,
intro:"When an attack succeeds, a calm, practiced process limits the damage. The exam tests the order of the steps and the forensic rules for handling evidence.",
s:[
["The process","1) **Preparation**: plans, tools, contacts and training ready before anything happens. 2) **Detection**: noticing something is wrong. 3) **Analysis**: confirming the incident and understanding scope. 4) **Containment**: stopping the spread, for example isolating a host. 5) **Eradication**: removing the cause, such as malware or a compromised account. 6) **Recovery**: restoring systems and monitoring them. 7) **Lessons learned**: reviewing what happened and improving defenses and the plan.",
["Prepare","Detect","Analyze","Contain","Eradicate","Recover","Learn"]],
["Training and testing","Run **tabletop exercises** (discussion-based walk-throughs) and **simulations** (hands-on rehearsals). After incidents, perform **root cause analysis** to find the real cause, not just the symptom. **Threat hunting** proactively searches for attackers that tools have not flagged."],
["Digital forensics","A **legal hold** stops normal deletion so relevant data is preserved for legal proceedings. **Chain of custody** records every person who handled evidence and when, proving it was not tampered with. **Acquisition** copies evidence, and **preservation** protects the copies, typically verified with hashes. **E-discovery** is the process of finding and producing electronic evidence for legal cases.\n\nCollect evidence in **order of volatility**, most fleeting first: CPU registers and cache, then RAM, then swap and temporary files, then disk, then remote logs, then archived backups."]],
terms:[["Containment","Limiting the spread of an incident"],["Chain of custody","Record of everyone who handled evidence"],["Legal hold","Preserving data for possible litigation"],["Order of volatility","Collect the most short-lived evidence first"]],
ex:"Ransomware hits a workstation. The analyst isolates it with EDR (containment), captures memory before powering anything off (volatility), blocks the malicious attachment across all mailboxes (eradication), restores files from a clean snapshot (recovery), and leads a review that adds attachment sandboxing (lessons learned).",
tip:"Contain before you eradicate, and capture RAM before you shut down.",
vid:"v-ir", ck:["incident response","Isolate","Threat hunting","order of volatility","Chain of custody","Legal hold","Root cause"]},

{id:"4.9",d:4,t:"Data sources for investigations",min:8,
intro:"Investigations depend on evidence. Knowing which data source answers which question saves hours during an incident.",
s:[
["Log data","**Firewall logs** show allowed and blocked connections. **Application logs** record what users and the app did. **Endpoint logs** capture process and file activity on devices. **OS-specific security logs**, like Windows Security events, record logins and privilege use. **IPS/IDS logs** show detected attacks. **Network logs** come from routers, switches and VPNs. **Metadata** (who sent an email, when a file was created) often tells as much as the content."],
["Other sources","**Vulnerability scans** show which weaknesses existed. **Automated reports** and **dashboards** summarize trends. **Packet captures** record full network traffic for deep analysis, while **NetFlow** records only summaries of who talked to whom."]],
terms:[["Packet capture","Full copy of network traffic"],["Metadata","Data about data, such as timestamps and senders"],["Endpoint log","Activity recorded on a device"]],
ex:"To learn whether data left the network, the investigator first checks NetFlow for large outbound transfers from the infected host, then pulls the matching packet capture to see exactly what was sent.",
tip:"Need the full content of traffic? Packet capture. Need just who, when and how much? NetFlow.",
vid:null, ck:["NetFlow","packet"]}
);
