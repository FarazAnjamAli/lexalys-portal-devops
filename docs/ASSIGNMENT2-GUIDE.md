# Assignment 2: Docker + Jenkins on AWS EC2 (step by step)

Course: CSC418 DevOps for Cloud Computing, Assignment 2.
App: Lexalys Labs Client Portal (Node.js + Express + MySQL), the same app used in Assignment 1.

Each step that needs a screenshot for the report is marked **[SS]**.

| | Part I (must stay UP) | Part II (must be DOWN at submission) |
|---|---|---|
| Compose file | `docker-compose.yml` | `docker-compose.ci.yml` |
| How the code gets in | `Dockerfile` -> image `farazanjamali/lexalys-portal` on Docker Hub | code attached as a volume from the Jenkins workspace |
| App URL | `http://<ELASTIC-IP>` (host 80 -> container 3000) | `http://<ELASTIC-IP>:8082` (host 8082 -> container 3000) |
| MySQL | host 3307 -> container 3306 | host 3308 -> container 3306 |
| Containers | `lexalys-web`, `lexalys-db` | `lexalys-ci-web`, `lexalys-ci-db` |
| DB volume | `lexalys_db_data` | `lexalys_ci_db_data` |
| Jenkins | | `http://<ELASTIC-IP>:8080` |

New files in this folder for Assignment 2:

| File | Purpose |
|---|---|
| `Dockerfile` | builds the app image (Part I) |
| `.dockerignore` | keeps secrets, tests, docs and `node_modules` out of the image |
| `docker-compose.yml` | Part I: web + MySQL with a persistent volume |
| `.env.docker.example` | template for the Part I secrets file (`.env`) on EC2 |
| `db/docker-init/01-grader-user.sh` | creates a read-only `grader` MySQL user on first start |
| `docker-compose.ci.yml` | Part II: same app, code as a volume, other ports and names |
| `Jenkinsfile` | Part II pipeline: build, deploy, smoke test, email |
| `.gitattributes` | forces Linux line endings so scripts work on EC2 |

---

## Step 0. Pick your passwords (write them down)

Letters and digits only, 8+ characters, no quotes or spaces.

| What | Example | Where it goes |
|---|---|---|
| MySQL root (Part I) | `RootPass2026x` | `.env` on EC2 |
| App DB user (Part I) | `LexApp2026x` | `.env` on EC2 |
| Grader read-only DB user | `Grader2026x` | `.env` on EC2, and the Google Form if asked |
| Portal admin login | `Admin2026x` | `.env` on EC2 |
| Docker Hub access token | (generated) | `docker login` on EC2 only |
| Gmail App Password | (generated, 16 letters) | Jenkins credentials only |

---

## Step 1. Put the code on GitHub

### 1.1 Create the repository

1. Go to <https://github.com/new>.
2. Owner `FarazAnjamAli`, name **`lexalys-portal-devops`**.
3. Visibility **Public** (Jenkins can then clone it without a token; a private repo also works, see 7.6).
4. Do **not** tick "Add a README", ".gitignore" or "license" (the folder already has them).
5. Click **Create repository**. **[SS]**

### 1.2 Push from your laptop

Open PowerShell (Git for Windows must be installed: `git --version`):

```powershell
cd "D:\LEXALYS LABS\aws-portal"
git init
git config user.name  "Faraz Anjam Ali"
git config user.email "faraz7179@gmail.com"
git add .
git status            # check: no .env, no .pem, no node_modules, no .docx in the list
git commit -m "Assignment 2: Dockerfile, compose files and Jenkins pipeline"
git branch -M main
git remote add origin https://github.com/FarazAnjamAli/lexalys-portal-devops.git
git push -u origin main
```

The first push opens a browser window to sign in to GitHub. **[SS]** of the repo page showing `Dockerfile`, `docker-compose.yml`, `docker-compose.ci.yml`, `Jenkinsfile`.

> The `user.email` above is the address Jenkins emails when **you** push. Use an address you can open.

### 1.3 Add the instructor as a collaborator

Repo -> **Settings** -> **Collaborators** -> **Add people** -> `qasimalik@gmail.com` -> **Add**. **[SS]**
He gets an invite email and must accept it before he can push.

---

## Step 2. Create the EC2 instance

One instance runs everything: Part I containers, Jenkins, and Part II containers.

### 2.1 Launch

EC2 console (pick one region, e.g. `ap-south-1` Mumbai) -> **Launch instance**:

| Setting | Value |
|---|---|
| Name | `lexalys-devops-a2` |
| AMI | **Ubuntu Server 24.04 LTS**, 64-bit (x86) |
| Instance type | **4 GB RAM or more** is best (`t3.medium`, or `c7i-flex.large` / `m7i-flex.large` if your account shows them as *Free tier eligible*). `t3.small` (2 GB) works with the swap file from step 3.2 but Jenkins is slow. Avoid 1 GB types. |
| Key pair | **Create new key pair** -> name `lexalys-a2-key`, RSA, `.pem`. Save it in `D:\LEXALYS LABS\keys\` (not inside the repo folder). |
| Storage | **30 GiB gp3** (Docker images + Jenkins need space) |

**[SS]** of AMI, instance type, key pair, storage.

### 2.2 Security group

**Network settings** -> **Edit** -> **Create security group** named `lexalys-a2-sg`. Inbound rules:

| Type | Port | Source | Why |
|---|---|---|---|
| SSH | 22 | My IP | your SSH login |
| HTTP | 80 | Anywhere-IPv4 `0.0.0.0/0` | Part I website |
| Custom TCP | 8080 | Anywhere-IPv4 | Jenkins UI **and** GitHub webhook |
| Custom TCP | 8082 | Anywhere-IPv4 | Part II website |
| Custom TCP | 3307 | Anywhere-IPv4 | Part I MySQL, so the evaluator can verify the database (read-only `grader` user) |

Do **not** open 3308 (Part II DB). Click **Launch instance**. **[SS]** of the rules.

### 2.3 Elastic IP (so the address never changes)

EC2 -> **Elastic IPs** -> **Allocate Elastic IP address** -> **Allocate**.
Select it -> **Actions** -> **Associate Elastic IP address** -> choose the instance -> **Associate**. **[SS]**

From now on `<EIP>` means this address, e.g. `13.234.10.20`.

---

## Step 3. Prepare the server

### 3.1 SSH in (PowerShell on your laptop)

```powershell
cd "D:\LEXALYS LABS\keys"
icacls lexalys-a2-key.pem /inheritance:r /grant:r "$($env:USERNAME):R"
ssh -i lexalys-a2-key.pem ubuntu@<EIP>
```

Type `yes` the first time. **[SS]**

### 3.2 Update, basic tools, swap file

```bash
sudo apt update && sudo apt -y upgrade
sudo apt install -y git curl unzip ca-certificates

# 4 GB swap so MySQL x2 + Jenkins never run out of memory
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

### 3.3 Install Docker Engine + Compose plugin

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
exit
```

SSH in again (so the group change applies), then check: **[SS]**

```bash
docker --version
docker compose version
docker run --rm hello-world
```

---

## Step 4. Part I: Dockerfile, Docker Hub, docker-compose

### 4.1 Docker Hub repository and token

1. <https://hub.docker.com> -> sign in as `farazanjamali` -> **Create repository** -> name `lexalys-portal`, Public -> **Create**. **[SS]**
2. Account settings -> **Personal access tokens** -> **Generate new token** -> description `ec2-a2`, permissions **Read & Write** -> copy the token (shown once).

### 4.2 Get the code onto EC2

```bash
cd ~
git clone https://github.com/FarazAnjamAli/lexalys-portal-devops.git
cd lexalys-portal-devops
ls -la
```

### 4.3 Create the secrets file

```bash
cp .env.docker.example .env
openssl rand -hex 32            # copy the output
nano .env                        # paste it as SESSION_SECRET, set your passwords
```

Save in nano: `Ctrl+O`, `Enter`, `Ctrl+X`. `.env` is in `.gitignore`, so it never reaches GitHub.

### 4.4 Build the image and push it to Docker Hub

```bash
docker login -u farazanjamali          # paste the access token as the password
docker build -t farazanjamali/lexalys-portal:1.0 -t farazanjamali/lexalys-portal:latest .
docker images | grep lexalys-portal
docker push farazanjamali/lexalys-portal:1.0
docker push farazanjamali/lexalys-portal:latest
```

**[SS]** of the build finishing, the push, and the Docker Hub page showing tags `1.0` and `latest`.
The image name matches `image: farazanjamali/lexalys-portal:latest` in `docker-compose.yml` (evaluation criterion).

### 4.5 Start Part I with docker compose

```bash
docker image rm farazanjamali/lexalys-portal:latest   # optional: prove it comes from Docker Hub
docker compose pull
docker compose up -d
docker compose ps        # wait until both show "healthy" (about 30-60 s)
docker compose logs web --tail 20
```

**[SS]** of `docker compose ps` (ports `0.0.0.0:80->3000`, `0.0.0.0:3307->3306`) and the logs ("Lexalys Portal listening on port 3000").

### 4.6 Verify

```bash
curl http://localhost/health
docker volume ls | grep lexalys
docker volume inspect lexalys_db_data
```

In your browser: **[SS]** of each

- `http://<EIP>` home page; the footer shows "Docker on AWS EC2 (Assignment 2, Part I)"
- `http://<EIP>/health` -> `{"status":"ok","database":"connected",...}`
- register a client, place an order, then sign in at `http://<EIP>/login` with `ADMIN_EMAIL` / `ADMIN_PASSWORD` and see the order under Admin

Optional demo data:

```bash
docker compose exec web node src/scripts/seed-demo.js
```

**Database check (criterion "Database integration verified over EC2"):**

```bash
docker compose exec db mysql -ulexalys_app -p lexalys_portal -e "SHOW TABLES; SELECT id, full_name, email, role FROM users; SELECT COUNT(*) FROM orders;"
```

From your laptop (MySQL Workbench or the `mysql` client): host `<EIP>`, port **3307**, user `grader`, password your `GRADER_PASSWORD`, database `lexalys_portal`. **[SS]**

### 4.7 Prove the volume keeps data

```bash
docker compose down          # containers removed, volume kept
docker compose up -d
docker compose exec db mysql -ulexalys_app -p lexalys_portal -e "SELECT COUNT(*) AS users FROM users;"
```

The count is the same as before. **[SS]**
(Never use `docker compose down -v`: `-v` deletes the volume.)

Part I is done. Leave it running.

---

## Step 5. Install Jenkins on the same EC2

### 5.1 Java and Jenkins (LTS)

```bash
sudo apt install -y fontconfig openjdk-21-jre
java -version

# find the current repository signing key name and install it
KEY=$(curl -fsSL https://pkg.jenkins.io/debian-stable/ | grep -o 'jenkins\.io-[0-9]*\.key' | sort -u | tail -n1)
echo "$KEY"
sudo mkdir -p /etc/apt/keyrings
sudo wget -O /etc/apt/keyrings/jenkins-keyring.asc "https://pkg.jenkins.io/debian-stable/$KEY"
echo "deb [signed-by=/etc/apt/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/" | sudo tee /etc/apt/sources.list.d/jenkins.list > /dev/null

sudo apt update
sudo apt install -y jenkins
sudo systemctl enable --now jenkins
sudo systemctl status jenkins --no-pager
```

If `echo "$KEY"` prints nothing, open <https://pkg.jenkins.io/debian-stable/> in a browser and use the key file name shown there.

### 5.2 Let Jenkins use Docker

```bash
sudo usermod -aG docker jenkins
sudo systemctl restart jenkins
sudo -u jenkins docker ps          # must list lexalys-web and lexalys-db, no "permission denied"
```

**[SS]**

### 5.3 First login

```bash
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

Browser -> `http://<EIP>:8080` -> paste the password -> **Install suggested plugins** -> create your admin user -> **Jenkins URL** = `http://<EIP>:8080/` -> **Save and Finish**. **[SS]**

### 5.4 Plugins

**Manage Jenkins** -> **Plugins** -> **Available plugins**. Search and tick the ones not already installed:

- **Git** (`git`)
- **Pipeline** (`workflow-aggregator`)
- **Docker Pipeline** (`docker-workflow`)  <- not in the suggested set
- **GitHub** (`github`)
- **Email Extension** (`email-ext`)

Click **Install**, tick **Restart Jenkins when installation is complete**. **[SS]** of the Installed plugins list filtered for each.

---

## Step 6. Email (Gmail SMTP)

### 6.1 Gmail App Password

1. The Gmail account that sends mail must have **2-Step Verification** on (<https://myaccount.google.com/security>).
2. Open <https://myaccount.google.com/apppasswords> -> name `jenkins` -> **Create** -> copy the 16-letter password.

### 6.2 Jenkins system settings

**Manage Jenkins** -> **System**:

1. **Jenkins Location**
   - Jenkins URL: `http://<EIP>:8080/`
   - System Admin e-mail address: `Lexalys Jenkins <your.gmail@gmail.com>` (must be the same Gmail, or Gmail rejects the mail)

2. **Extended E-mail Notification** (used by the Jenkinsfile)
   - SMTP server: `smtp.gmail.com`
   - SMTP Port: `465`
   - **Advanced** -> Credentials -> **Add** -> **Jenkins** -> Kind *Username with password*: username = your Gmail address, password = the App Password, ID `gmail-smtp` -> **Add**, then select it
   - Tick **Use SSL**
   - Default Content Type: **HTML (text/html)**

3. **E-mail Notification** (only used for the test button)
   - SMTP server `smtp.gmail.com`, **Advanced** -> tick *Use SMTP Authentication* (Gmail + App Password), tick *Use SSL*, port `465`
   - Tick **Test configuration by sending test e-mail**, enter your address, **Test configuration** -> "Email was successfully sent". **[SS]**

Click **Save**.

---

## Step 7. Pipeline job and GitHub webhook

### 7.1 Create the job

Dashboard -> **New Item** -> name `lexalys-portal-pipeline` -> **Pipeline** -> **OK**.

- **General**: tick **GitHub project**, URL `https://github.com/FarazAnjamAli/lexalys-portal-devops/`
- **Triggers**: tick **GitHub hook trigger for GITScm polling**
- **Pipeline**:
  - Definition: **Pipeline script from SCM**
  - SCM: **Git**
  - Repository URL: `https://github.com/FarazAnjamAli/lexalys-portal-devops.git`
  - Credentials: none (public repo)
  - Branch Specifier: `*/main`
  - Script Path: `Jenkinsfile`

**Save**. **[SS]** of each section.

### 7.2 First run (manual)

Click **Build Now**. The first run downloads `node:22-alpine` and `mysql:8.4`, so it takes 2-3 minutes. Open the build -> **Console Output**. **[SS]** of the stages finishing with `SUCCESS`.

Check on the server:

```bash
docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}"
```

You see four containers: `lexalys-web`, `lexalys-db` (Part I) and `lexalys-ci-web`, `lexalys-ci-db` (Part II). **[SS]**
Browser: `http://<EIP>:8082` shows the footer "Jenkins CI on AWS EC2 (Assignment 2, Part II) - build #1". **[SS]**
You also get the build email. **[SS]**

### 7.3 GitHub webhook

GitHub repo -> **Settings** -> **Webhooks** -> **Add webhook**:

| Field | Value |
|---|---|
| Payload URL | `http://<EIP>:8080/github-webhook/` (the trailing `/` matters) |
| Content type | `application/json` |
| Secret | leave empty |
| SSL verification | (not shown for http) |
| Events | **Just the push event** |
| Active | ticked |

**Add webhook**. Open it -> **Recent Deliveries** -> the ping shows a green tick / `200`. **[SS]**

### 7.4 Test the full loop with a push

On your laptop, change something visible, e.g. a word in `views/home.ejs`, then:

```powershell
cd "D:\LEXALYS LABS\aws-portal"
git add .
git commit -m "Test webhook trigger"
git push
```

Within seconds a new build starts in Jenkins ("Started by GitHub push by FarazAnjamAli"). **[SS]**
After it finishes: the change is live on `http://<EIP>:8082` and the email arrives. **[SS]** of the email.

### 7.5 Bring Part II DOWN before submitting

The assignment says Part II must be down until the instructor pushes:

```bash
docker compose -p lexalys-ci down                                  # no -v, so CI data is kept
docker ps --format "table {{.Names}}\t{{.Status}}"                 # only lexalys-web and lexalys-db
```

**[SS]**. When the instructor pushes, the webhook starts the pipeline, which brings Part II up in about 1-2 minutes and emails him.

### 7.6 If the repo is private

GitHub -> Settings -> Developer settings -> **Personal access tokens (classic)** -> scope `repo` -> generate.
Jenkins job -> Pipeline -> Credentials -> **Add** -> Username with password: username `FarazAnjamAli`, password = the token. Select it and save.

---

## Step 8. Before you submit (checklist)

- [ ] `docker ps` shows only `lexalys-web` and `lexalys-db`, both healthy
- [ ] `http://<EIP>` and `http://<EIP>/health` open from your phone (mobile data, not your Wi-Fi)
- [ ] Docker Hub shows `farazanjamali/lexalys-portal:latest`
- [ ] `http://<EIP>:8080` opens Jenkins; last build is green
- [ ] Webhook "Recent Deliveries" are green
- [ ] `qasimalik@gmail.com` is a collaborator (accepted, or at least invited)
- [ ] Jenkins email test works
- [ ] Elastic IP is attached; the instance is **running** (do not stop it until grading is over)
- [ ] Report has `Dockerfile`, `docker-compose.yml` (Part I), `docker-compose.ci.yml` and `Jenkinsfile` (Part II) pasted in

**Google Form values:**

| Field | Value |
|---|---|
| Part I URL | `http://<EIP>` |
| Docker Hub image | `https://hub.docker.com/r/farazanjamali/lexalys-portal` |
| GitHub repo | `https://github.com/FarazAnjamAli/lexalys-portal-devops` |
| Jenkins URL | `http://<EIP>:8080` |
| Part II URL | `http://<EIP>:8082` |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `permission denied ... docker.sock` in Jenkins | `sudo usermod -aG docker jenkins && sudo systemctl restart jenkins` |
| Webhook delivery shows timeout | port 8080 not open to `0.0.0.0/0`, or Jenkins URL wrong; Payload URL must end in `/github-webhook/` |
| Push does not start a build | run one build manually first (registers the trigger); check *GitHub hook trigger for GITScm polling* is ticked |
| No email | check Jenkins Location *System Admin e-mail* = your Gmail; App Password, port 465 + SSL; look at the end of the console log for "Sending email to: ..." |
| Email goes to a `@users.noreply.github.com` address | the pusher's git email is hidden. They should set `git config user.email` to a real address. As a fallback, put an address in `ALWAYS_NOTIFY` in the `Jenkinsfile` |
| `lexalys-web` keeps restarting | `docker compose logs web` - usually a wrong password in `.env`. If you changed DB passwords after the first start, the old volume still has the old ones: `docker compose down -v && docker compose up -d` (this wipes Part I data) |
| Build very slow / killed | instance too small; check `free -h`, confirm swap is on |
| Port 80 already in use | something else (nginx from Assignment 1?) is running: `sudo systemctl disable --now nginx` |

---

## Screenshot list for the report

1. GitHub repo with the files; collaborator added
2. EC2 launch settings, security group rules, Elastic IP
3. SSH session; `docker --version`, `docker compose version`
4. Docker Hub repo + token page (hide the token)
5. `docker build` and `docker push` output; Docker Hub tags
6. `docker compose ps` (Part I), logs, `docker volume ls`
7. App in browser (home, `/health`, admin page with data)
8. MySQL query output / Workbench connection on port 3307
9. Volume persistence test (down, up, same count)
10. Jenkins unlock, plugins installed, `sudo -u jenkins docker ps`
11. Email settings + successful test email
12. Pipeline job configuration (all sections)
13. Webhook with green delivery
14. Build triggered by GitHub push: stage view + console output
15. Part II app on port 8082 showing the build number
16. Build result email in the inbox
17. Final `docker ps` with Part II down
