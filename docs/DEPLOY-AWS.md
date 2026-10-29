# Deploying the Lexalys Labs Client Portal on AWS

This guide covers both parts of the assignment:

- **Part I (IaaS):** the app and MySQL on one Ubuntu EC2 instance.
- **Part II (PaaS):** the code goes into S3, Elastic Beanstalk runs it, and Amazon RDS hosts MySQL.

Each step that needs a screenshot for the report is marked **[SS]**.

Use **one AWS region** for everything (for example `us-east-1` or `ap-south-1` Mumbai).

---

## 0. Before you start (on your laptop)

1. Open PowerShell in `D:\LEXALYS LABS\aws-portal` and build the upload zip:

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\package.ps1
   ```

   This creates `dist\lexalys-portal-<date>.zip`. The same zip is used for both parts. **[SS]**

2. Choose and write down four passwords. Use letters and numbers only, at least 8 characters, and no quotes or spaces:

   | What | Example name | Used for |
   |---|---|---|
   | App DB password | `LexApp2026x` | the app's MySQL user on EC2 |
   | Grader password | `Grader2026x` | the read-only account you give the evaluator |
   | Portal admin password | `Admin2026x` | signing in to `/admin` on the website |
   | RDS master password | `RdsMaster2026x` | the RDS `admin` user in Part II |

---

## Part I: IaaS with Amazon EC2

### I-1. Launch the Ubuntu instance

EC2 console, then **Launch instance**:

| Setting | Value |
|---|---|
| Name | `lexalys-portal-ec2` |
| AMI | **Ubuntu Server 24.04 LTS** (64-bit x86) |
| Instance type | `t2.micro` or `t3.micro` (free tier eligible) |
| Key pair | **Create new key pair**: name `lexalys-key`, type RSA, format `.pem`. The browser downloads it. Keep it safe. |
| Storage | 15 GiB gp3 |

**[SS]** for the AMI choice, instance type and key pair.

### I-2. Security group rules

Under **Network settings**, click **Edit** and create a security group named `lexalys-ec2-sg` with these inbound rules:

| Type | Port | Source | Why |
|---|---|---|---|
| SSH | 22 | My IP | you log in from your laptop |
| HTTP | 80 | Anywhere (0.0.0.0/0) | the website |
| MYSQL/Aurora | 3306 | Anywhere (0.0.0.0/0) | the grader's script connects to the database |

**[SS]** of the rules. Then click **Launch instance**.

> **Keep the IP stable.** If you stop and start the instance, its public IP and DNS name change and the URLs in your form stop working. Either leave it running until grading is done, or go to **Elastic IPs**, allocate one, and associate it with the instance.

### I-3. Connect with SSH

Copy the instance's **Public IPv4 DNS** (for example `ec2-13-233-10-20.ap-south-1.compute.amazonaws.com`). **[SS]**

In PowerShell, in the folder that holds `lexalys-key.pem`:

```powershell
icacls lexalys-key.pem /inheritance:r /grant:r "$($env:USERNAME):R"
ssh -i lexalys-key.pem ubuntu@<PUBLIC-DNS>
```

Type `yes` the first time. You are now on the server. **[SS]**

### I-4. Upload the code

Open a **second** PowerShell window on your laptop (the first stays connected):

```powershell
scp -i lexalys-key.pem "D:\LEXALYS LABS\aws-portal\dist\lexalys-portal-<date>.zip" ubuntu@<PUBLIC-DNS>:~/
```

Back in the SSH window:

```bash
sudo apt update
sudo apt install -y unzip
unzip lexalys-portal-*.zip -d lexalys-portal
cd lexalys-portal
ls
```

**[SS]**

### I-5. Install and configure everything

**Quick route.** One script does steps A to H below and asks for your passwords:

```bash
sudo bash deploy/ec2/setup.sh
```

**Manual route.** Use this if you want a screenshot of each step for the report. Run these one at a time.

**A. Install the servers with the package manager** **[SS]**

```bash
sudo apt install -y nginx mysql-server nodejs npm
sudo npm install -g pm2
node -v && mysql --version && nginx -v
```

**B. Start them and enable them on boot**

```bash
sudo systemctl enable --now mysql nginx
sudo systemctl status mysql --no-pager
```

**C. Let MySQL accept remote connections** (the grader connects from outside)

```bash
sudo sed -i 's/^bind-address.*/bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf
sudo systemctl restart mysql
sudo ss -ltnp | grep 3306        # should show 0.0.0.0:3306
```

**D. Create the database, the app user and the read-only grader user** **[SS]**

```bash
sudo mysql
```

```sql
CREATE DATABASE lexalys_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'lexalys_app'@'localhost' IDENTIFIED BY 'LexApp2026x';
GRANT ALL PRIVILEGES ON lexalys_portal.* TO 'lexalys_app'@'localhost';
CREATE USER 'grader'@'%' IDENTIFIED BY 'Grader2026x';
GRANT SELECT ON lexalys_portal.* TO 'grader'@'%';
FLUSH PRIVILEGES;
SHOW GRANTS FOR 'grader'@'%';
EXIT;
```

**E. Set up the schema** **[SS]**

```bash
sudo mysql lexalys_portal < db/schema.sql
sudo mysql lexalys_portal -e "SHOW TABLES;"
```

You should see six tables: `leads`, `order_events`, `orders`, `services`, `sessions`, `users`.

**F. Put the app in place and set its permissions**

```bash
sudo mkdir -p /var/www/lexalys-portal
sudo cp -r package.json package-lock.json src views public db deploy /var/www/lexalys-portal/
sudo chown -R ubuntu:ubuntu /var/www/lexalys-portal
cd /var/www/lexalys-portal
cp ~/lexalys-portal/.env.example .env
nano .env
```

In `nano`, set these lines, then save with Ctrl+O, Enter, Ctrl+X:

```
DEPLOY_LABEL=AWS EC2 (IaaS)
DB_HOST=127.0.0.1
DB_USER=lexalys_app
DB_PASSWORD=LexApp2026x
DB_NAME=lexalys_portal
SESSION_SECRET=<paste the output of: openssl rand -hex 32>
ADMIN_EMAIL=<your email>
ADMIN_PASSWORD=Admin2026x
```

```bash
chmod 600 .env                 # only the ubuntu user can read the secrets
npm ci --omit=dev              # install dependencies
npm run db:init                # adds the 19 services and your admin account
npm run seed:demo              # optional: demo clients, leads and orders
```

**[SS]** of `db:init` printing "Database is ready."

**G. Start the app with PM2** (restarts it after crashes and reboots)

```bash
pm2 start deploy/ec2/ecosystem.config.js
pm2 save
sudo env PATH=$PATH pm2 startup systemd -u ubuntu --hp /home/ubuntu
pm2 status
```

**[SS]** of `pm2 status` showing `online`.

**H. Put Nginx in front on port 80** **[SS]**

```bash
sudo cp deploy/ec2/nginx-lexalys-portal.conf /etc/nginx/sites-available/lexalys-portal
sudo ln -s /etc/nginx/sites-available/lexalys-portal /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
curl http://localhost/health
```

### I-6. Check that it works

1. Open `http://<PUBLIC-DNS>/` in your browser. The footer should say **Running on AWS EC2 (IaaS)**. **[SS]**
2. Open `http://<PUBLIC-DNS>/health`. It should show `"database":"connected"`. **[SS]**
3. Register a client account, place an order and send a contact message. Then sign in as the admin at `/login` and open `/admin`. **[SS]** of each.
4. Test the grader account the way the evaluation script will use it, from outside localhost:

   ```bash
   mysql -h <PUBLIC-IP> -u grader -p lexalys_portal -e "SHOW TABLES; SELECT COUNT(*) FROM users; SELECT order_no, status FROM orders;"
   mysql -h <PUBLIC-IP> -u grader -p lexalys_portal -e "DELETE FROM leads;"   # must fail: command denied
   ```

   **[SS]** of both. The first should list your data. The second must be refused.

**Values for the Google Form (Part I):**

| Field | Value |
|---|---|
| App URL | `http://<PUBLIC-DNS>/` |
| DB host | `<PUBLIC-IP>` or `<PUBLIC-DNS>` |
| Port | `3306` |
| Database | `lexalys_portal` |
| User / password | `grader` / your grader password |

---

## Part II: PaaS with S3, Elastic Beanstalk and RDS

### II-1. Create the RDS MySQL database

RDS console, then **Create database**:

| Setting | Value |
|---|---|
| Creation method | Standard create |
| Engine | **MySQL**, version **8.0.x** (latest 8.0) |
| Template | **Free tier** |
| DB instance identifier | `lexalys-portal-db` |
| Master username | `admin` |
| Master password | your RDS master password |
| Instance class | `db.t3.micro` or `db.t4g.micro` |
| Storage | 20 GiB gp2/gp3, storage autoscaling **off** |
| Compute resource | Don't connect to an EC2 compute resource |
| Public access | **Yes** (the grader connects from outside AWS) |
| VPC security group | Create new: `lexalys-rds-sg` |
| Additional configuration, Initial database name | `lexalys_portal` |
| Automated backups | can be turned off to save cost |

**[SS]** of the engine, template, connectivity and "Initial database name" sections. Click **Create database** and wait about 5 to 10 minutes until the status is **Available**.

Open the database and copy its **Endpoint**, for example `lexalys-portal-db.abc123xyz.ap-south-1.rds.amazonaws.com`. **[SS]**

Click the security group `lexalys-rds-sg`, then **Edit inbound rules**, and add: **MYSQL/Aurora, port 3306, source Anywhere (0.0.0.0/0)**. This lets both Elastic Beanstalk and the grader reach it. **[SS]**

### II-2. Set up the schema and the grader user on RDS

Your EC2 instance from Part I already has the MySQL client and the code, so use it as the admin machine. In the SSH window:

```bash
cd ~/lexalys-portal
mysql -h <RDS-ENDPOINT> -u admin -p lexalys_portal < db/schema.sql
mysql -h <RDS-ENDPOINT> -u admin -p
```

```sql
USE lexalys_portal;
SHOW TABLES;
CREATE USER 'grader'@'%' IDENTIFIED BY 'Grader2026x';
GRANT SELECT ON lexalys_portal.* TO 'grader'@'%';
FLUSH PRIVILEGES;
SHOW GRANTS FOR 'grader'@'%';
EXIT;
```

**[SS]** of both.

### II-3. Upload the code to S3

S3 console, then **Create bucket**:

- Name: `lexalys-portal-deploy-<your-reg-no-lowercase>`. Bucket names must be globally unique and lowercase.
- Region: the same region as everything else.
- Keep **Block all public access** on.

Open the bucket, click **Upload**, add `lexalys-portal-<date>.zip`, then **Upload**. **[SS]**

Click the uploaded file and copy its **Object URL**, for example `https://lexalys-portal-deploy-fa23bse202.s3.ap-south-1.amazonaws.com/lexalys-portal-20261009-1200.zip`. **[SS]**

### II-4. Create the Elastic Beanstalk instance role (one time per account)

Elastic Beanstalk needs an IAM role for its EC2 instance. If `aws-elasticbeanstalk-ec2-role` does not exist yet, create it:

IAM console, **Roles**, **Create role**, then **AWS service: EC2**, and attach these policies:

- `AWSElasticBeanstalkWebTier`
- `AWSElasticBeanstalkWorkerTier`
- `AWSElasticBeanstalkMulticontainerDocker`

Name the role `aws-elasticbeanstalk-ec2-role`. **[SS]**

### II-5. Create the Elastic Beanstalk environment

Elastic Beanstalk console, then **Create application**.

**Step 1: Configure environment** **[SS]**

| Setting | Value |
|---|---|
| Environment tier | Web server environment |
| Application name | `lexalys-portal` |
| Environment name | `lexalys-portal-env` |
| Domain | for example `lexalys-fa23bse202` (check availability) |
| Platform | **Node.js**, latest branch "Node.js 22 (or 20) running on 64bit Amazon Linux 2023" |
| Application code | **Upload your code**, version label `v1`, then **Public S3 URL** and paste the S3 Object URL from II-3 |
| Presets | **Single instance (free tier eligible)** |

> If the console will not accept the S3 URL, open **CloudShell** (the `>_` icon at the top of the console) and run:
> ```bash
> aws elasticbeanstalk create-application --application-name lexalys-portal
> aws elasticbeanstalk create-application-version --application-name lexalys-portal --version-label v1 \
>   --source-bundle S3Bucket=<your-bucket>,S3Key=<zip-file-name>
> ```
> Then choose **Existing version: v1** in the console.

**Step 2: Configure service access** **[SS]**

- Service role: **Create and use new service role** (`aws-elasticbeanstalk-service-role`)
- EC2 key pair: `lexalys-key` (optional, lets you SSH in)
- EC2 instance profile: `aws-elasticbeanstalk-ec2-role`

**Step 3: Networking and database**

- VPC: the default VPC. **Public IP address: Activated**. Tick at least one subnet.
- **Do not** enable the database here. You already created RDS separately, which keeps the database alive even if the environment is deleted.

**Step 4: Instance traffic and scaling**: keep the defaults; instance type `t3.micro`.

**Step 5: Updates, monitoring and logging**: scroll to **Environment properties** and add: **[SS]**

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DEPLOY_LABEL` | `AWS Elastic Beanstalk (PaaS)` |
| `DB_HOST` | your RDS endpoint |
| `DB_PORT` | `3306` |
| `DB_USER` | `admin` |
| `DB_PASSWORD` | your RDS master password |
| `DB_NAME` | `lexalys_portal` |
| `DB_SSL` | `rds` |
| `SESSION_SECRET` | any long random string |
| `ADMIN_EMAIL` | your email |
| `ADMIN_PASSWORD` | your portal admin password |

Elastic Beanstalk sets `PORT=8080` by itself, and the app listens on it.

**Step 6: Review**, then **Submit**. Creating the environment takes 5 to 10 minutes. When **Health** turns **Green (Ok)**, take a **[SS]** of the environment page.

### II-6. Check that it works

1. Open the environment URL, `http://lexalys-fa23bse202.<region>.elasticbeanstalk.com/`. The footer should say **Running on AWS Elastic Beanstalk (PaaS)**. **[SS]**
2. Open `/health`. **[SS]**
3. Register, place an order, send a contact message, and sign in as the admin. **[SS]**
4. Optional demo data on RDS, run from the EC2 instance:
   ```bash
   cd /var/www/lexalys-portal
   DB_HOST=<RDS-ENDPOINT> DB_USER=admin DB_PASSWORD=<RDS-MASTER> DB_SSL=rds npm run seed:demo
   ```
5. Test the grader account against RDS:
   ```bash
   mysql -h <RDS-ENDPOINT> -u grader -p lexalys_portal -e "SHOW TABLES; SELECT COUNT(*) FROM users; SELECT order_no, status FROM orders;"
   mysql -h <RDS-ENDPOINT> -u grader -p lexalys_portal -e "DELETE FROM leads;"   # must fail
   ```
   **[SS]**

**Values for the Google Form (Part II):**

| Field | Value |
|---|---|
| App URL | `http://<your-env>.<region>.elasticbeanstalk.com/` |
| DB host | `<RDS-ENDPOINT>` |
| Port | `3306` |
| Database | `lexalys_portal` |
| User / password | `grader` / your grader password |

### Deploying a new version later

Run `deploy\package.ps1` again. In the environment, click **Upload and deploy**, choose the new zip, and give it a new version label such as `v2`.

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Browser times out on the EC2 URL | Port 80 is not open in `lexalys-ec2-sg`, or you used `https://`. Use `http://`. |
| `502 Bad Gateway` from Nginx on EC2 | The app is not running. Run `pm2 logs lexalys-portal` to see why. It is usually a wrong DB password in `.env`. |
| Grader test says "Can't connect" (EC2) | Port 3306 is not open in the security group, or `bind-address` is still `127.0.0.1`. Check with `sudo ss -ltnp \| grep 3306`. |
| Grader test says "Access denied" | Wrong password, or the user was created as `'grader'@'localhost'` instead of `'grader'@'%'`. |
| Elastic Beanstalk health is **Severe** or **Degraded** | Open **Logs**, then **Request logs**, then **Last 100 lines**, and read `web.stdout.log`. `ETIMEDOUT` means the RDS security group does not allow 3306. `ER_ACCESS_DENIED_ERROR` means a wrong `DB_USER` or `DB_PASSWORD`. |
| EB log shows an SSL or certificate error | Remove the `DB_SSL` property and apply. RDS MySQL 8.0 allows connections without TLS. |
| EB deploy fails with "package.json not found" | The zip was built with folders one level too deep. Rebuild with `deploy\package.ps1`. |
| Site works but you are logged out after every click | `SESSION_SECRET` changes on every restart. Set it as an environment property. |

---

## After grading: avoid charges

Delete these in this order: the Elastic Beanstalk environment, the RDS database (skip the final snapshot), the EC2 instance, any Elastic IP, and the S3 bucket. Check **Billing**, then **Bills**, a day later.
