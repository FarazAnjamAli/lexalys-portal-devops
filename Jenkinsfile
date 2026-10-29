// ---------------------------------------------------------------------------
// Assignment 2 - Part II: Jenkins pipeline (build phase)
// Plugins used: Git, Pipeline, Docker Pipeline, GitHub (webhook trigger),
//               Mailer (build result mail)
//
// Flow: GitHub push -> webhook -> this pipeline
//       1. read who pushed (commit author email)
//       2. build: install dependencies + syntax check inside node:22-alpine
//          (Docker Pipeline plugin: docker.image(...).inside)
//       3. deploy: docker compose -f docker-compose.ci.yml up -d
//       4. smoke test: wait until http://localhost:8082/health says ok
//       5. email the result to the person who made the push
// ---------------------------------------------------------------------------
pipeline {
    agent any

    triggers {
        githubPush()          // fired by the GitHub webhook
    }

    options {
        disableConcurrentBuilds()
        timeout(time: 10, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '15'))
    }

    environment {
        COMPOSE_FILE   = 'docker-compose.ci.yml'
        COMPOSE_PROJECT_NAME = 'lexalys-ci'
        APP_PORT       = '8082'
        // Optional: an address that always gets a copy (leave empty if not needed)
        ALWAYS_NOTIFY  = ''
    }

    stages {
        stage('Commit info') {
            steps {
                script {
                    env.COMMIT_EMAIL  = sh(script: "git log -1 --pretty=format:'%ae'", returnStdout: true).trim()
                    env.COMMIT_AUTHOR = sh(script: "git log -1 --pretty=format:'%an'", returnStdout: true).trim()
                    env.COMMIT_MSG    = sh(script: "git log -1 --pretty=format:'%s'",  returnStdout: true).trim()
                    env.COMMIT_SHA    = sh(script: "git rev-parse --short HEAD",       returnStdout: true).trim()
                    env.JENKINS_UID   = sh(script: 'id -u', returnStdout: true).trim()
                    env.JENKINS_GID   = sh(script: 'id -g', returnStdout: true).trim()
                    env.PUBLIC_IP     = sh(script: "curl -s --max-time 3 https://checkip.amazonaws.com || hostname -I | awk '{print \$1}'", returnStdout: true).trim()
                }
                echo "Commit ${env.COMMIT_SHA} by ${env.COMMIT_AUTHOR} <${env.COMMIT_EMAIL}>: ${env.COMMIT_MSG}"
            }
        }

        stage('Build (Node.js in Docker)') {
            steps {
                script {
                    // Docker Pipeline plugin: run the build steps inside a throwaway container
                    docker.image('node:22-alpine').inside('-e HOME=/tmp -e npm_config_cache=/tmp/.npm') {
                        sh 'node -v && npm -v'
                        sh 'npm ci --omit=dev --no-audit --no-fund'
                        sh 'for f in $(find src -name "*.js"); do node --check "$f"; done'
                        sh 'echo "Build OK: dependencies installed, all source files compile"'
                    }
                }
            }
        }

        stage('Deploy (Docker Compose)') {
            steps {
                sh 'docker compose version'
                sh 'docker compose pull ci-db ci-web'
                sh 'docker compose up -d --force-recreate --remove-orphans'
                sh 'docker compose ps'
            }
        }

        stage('Smoke test') {
            steps {
                sh '''
                    echo "Waiting for http://localhost:${APP_PORT}/health ..."
                    for i in $(seq 1 36); do
                        if curl -fsS "http://localhost:${APP_PORT}/health"; then
                            echo ""
                            echo "Application is up."
                            exit 0
                        fi
                        sleep 5
                    done
                    echo "Application did not become healthy in 3 minutes"
                    docker compose logs --tail 80
                    exit 1
                '''
            }
        }
    }

    post {
        always {
            script {
                def recipients = [env.COMMIT_EMAIL, env.ALWAYS_NOTIFY].findAll { it }.join(',')
                def status = currentBuild.currentResult
                def color = status == 'SUCCESS' ? '#1a7f37' : '#cf222e'
                // Uses the "E-mail Notification" SMTP settings (Mailer plugin)
                mail(
                    to: recipients,
                    subject: "[Jenkins] ${env.JOB_NAME} #${env.BUILD_NUMBER}: ${status}",
                    mimeType: 'text/html',
                    charset: 'UTF-8',
                    body: """
                        <h2 style="color:${color}">Build ${status}</h2>
                        <table cellpadding="4">
                          <tr><td><b>Job</b></td><td>${env.JOB_NAME} #${env.BUILD_NUMBER}</td></tr>
                          <tr><td><b>Commit</b></td><td>${env.COMMIT_SHA}: ${env.COMMIT_MSG}</td></tr>
                          <tr><td><b>Pushed by</b></td><td>${env.COMMIT_AUTHOR} &lt;${env.COMMIT_EMAIL}&gt;</td></tr>
                          <tr><td><b>Duration</b></td><td>${currentBuild.durationString}</td></tr>
                          <tr><td><b>Application</b></td><td><a href="http://${env.PUBLIC_IP}:${env.APP_PORT}">http://${env.PUBLIC_IP}:${env.APP_PORT}</a></td></tr>
                          <tr><td><b>Console log</b></td><td><a href="${env.BUILD_URL}console">${env.BUILD_URL}console</a></td></tr>
                        </table>
                    """
                )
            }
        }
    }
}
