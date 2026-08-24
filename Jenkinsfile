pipeline {

    agent any

    environment {
        APP_NAME = 'prometric-app'
        APP_IMAGE = 'prometric-dash-corrected-app:latest'
        POSTGRES_NAME = 'prometric-postgres'
        COMPOSE_FILE = 'docker-compose.yml'
        GITHUB_REPO = 'https://github.com/dev-lab2026/clarity.git'
    }

    triggers {
        githubPush()
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '5'))
        timeout(time: 60, unit: 'MINUTES')
        timestamps()
        disableConcurrentBuilds()
    }

    stages {

        stage('Checkout') {
            steps {
                echo '📥 Checkout GitHub...'

                deleteDir()

                checkout([
                    $class: 'GitSCM',
                    branches: [[name: '*/main']],
                    userRemoteConfigs: [[
                        url: "${GITHUB_REPO}",
                        credentialsId: 'github-credentials'
                    ]]
                ])

                sh '''
                    set -e

                    echo "📁 Workspace:"
                    pwd

                    echo "📦 Fichiers:"
                    ls -la

                    test -f Dockerfile
                    test -f docker-compose.yml
                    test -f package.json
                    test -f bun.lock
                    test -f docker-entrypoint.cjs
                    test -f server.ts
                    test -f .env

                    echo "✅ Repository valide"
                '''
            }
        }

        stage('Validate Project') {
            steps {
                sh '''
                    set -e

                    echo "🔎 Validation package.json..."

                    node -e "
                    const p=require('./package.json');
                    if (!p.scripts || !p.scripts.build) {
                        console.error('❌ script build absent');
                        process.exit(1);
                    }
                    console.log('Build:', p.scripts.build);
                    "

                    echo ""
                    echo "🔎 Vérification Vite..."

                    VITE_COUNT=$(grep -c '"vite"' package.json || true)

                    if [ "$VITE_COUNT" -ne 1 ]; then
                        echo "❌ vite doit apparaître une seule fois dans package.json"
                        grep -n '"vite"' package.json || true
                        exit 1
                    fi

                    echo "✅ package.json valide"

                    echo ""
                    echo "🔎 Validation Docker Compose..."

                    docker compose config >/dev/null

                    echo "✅ docker-compose.yml valide"
                '''
            }
        }

        stage('Prepare Docker Network') {
            steps {
                sh '''
                    set -e

                    if docker network inspect shared_network >/dev/null 2>&1; then
                        echo "✅ shared_network existe"
                    else
                        echo "🌐 Création de shared_network..."
                        docker network create shared_network
                    fi
                '''
            }
        }

        stage('Build Docker Image') {
            steps {
                echo '🐳 Build Docker de l’application...'

                sh '''
                    set -e

                    echo "=========================================="
                    echo " BUILD : ${APP_IMAGE}"
                    echo "=========================================="

                    docker compose build --pull app

                    echo ""
                    echo "🔎 Vérification image..."

                    docker image inspect "${APP_IMAGE}" >/dev/null

                    echo "✅ Image Docker construite"
                '''
            }
        }

        stage('Start PostgreSQL') {
            steps {
                echo '🐘 Démarrage PostgreSQL...'

                sh '''
                    set -e

                    docker compose up -d postgres

                    echo "⏳ Attente PostgreSQL..."

                    for i in $(seq 1 30); do

                        STATUS=$(docker inspect \
                            --format='{{.State.Health.Status}}' \
                            "${POSTGRES_NAME}" \
                            2>/dev/null || echo "starting")

                        echo "PostgreSQL: ${STATUS}"

                        if [ "${STATUS}" = "healthy" ]; then
                            echo "✅ PostgreSQL healthy"
                            exit 0
                        fi

                        if [ "${STATUS}" = "unhealthy" ]; then
                            echo "❌ PostgreSQL unhealthy"
                            docker logs --tail 150 "${POSTGRES_NAME}" || true
                            exit 1
                        fi

                        sleep 2
                    done

                    echo "❌ Timeout PostgreSQL"
                    docker logs --tail 150 "${POSTGRES_NAME}" || true
                    exit 1
                '''
            }
        }

        stage('Deploy Application') {
            steps {
                echo '🚀 Déploiement application...'

                sh '''
                    set -e

                    echo "🔎 Vérification ancien conteneur ${APP_NAME}..."

                    if docker ps -a --format '{{.Names}}' | grep -qx "${APP_NAME}"; then
                        echo "🛑 Suppression de l'ancien ${APP_NAME}..."
                        docker rm -f "${APP_NAME}"
                    fi

                    echo "🚀 Démarrage nouvelle version..."

                    docker compose up -d --no-deps app

                    echo "✅ Application démarrée"
                '''
            }
        }

        stage('Health Check') {
            steps {
                echo '🔍 Vérification application...'

                sh '''
                    set -e

                    echo "⏳ Attente du conteneur..."

                    for i in $(seq 1 30); do

                        STATUS=$(docker inspect \
                            --format='{{.State.Status}}' \
                            "${APP_NAME}" \
                            2>/dev/null || echo "missing")

                        HEALTH=$(docker inspect \
                            --format='{{.State.Health.Status}}' \
                            "${APP_NAME}" \
                            2>/dev/null || echo "none")

                        echo "Container: ${STATUS} | Health: ${HEALTH}"

                        if [ "${STATUS}" = "exited" ] || [ "${STATUS}" = "dead" ]; then
                            echo "❌ Application arrêtée"
                            docker logs --tail 250 "${APP_NAME}" || true
                            exit 1
                        fi

                        if [ "${HEALTH}" = "healthy" ]; then
                            echo "✅ Docker healthcheck OK"
                            break
                        fi

                        sleep 2
                    done

                    echo ""
                    echo "🌐 Test HTTP..."

                    curl --fail \
                         --silent \
                         --show-error \
                         --max-time 10 \
                         http://127.0.0.1:3000/api/health

                    echo ""
                    echo "✅ /api/health OK"
                '''
            }
        }

        stage('Cleanup Docker') {
            steps {
                echo '🧹 Nettoyage Docker...'

                sh '''
                    set -e

                    echo "🧹 Suppression des containers arrêtés..."

                    docker container prune -f

                    echo ""
                    echo "🧹 Suppression des images dangling..."

                    docker image prune -f

                    echo ""
                    echo "📦 Images restantes:"

                    docker images \
                        --format 'table {{.Repository}}\\t{{.Tag}}\\t{{.ID}}\\t{{.CreatedSince}}'
                '''
            }
        }

        stage('Final Verification') {
            steps {
                sh '''
                    set -e

                    echo ""
                    echo "=========================================="
                    echo "       DEPLOYMENT FINAL STATUS"
                    echo "=========================================="

                    docker ps \
                        --format 'table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}'

                    echo ""
                    echo "Application:"
                    docker inspect "${APP_NAME}" \
                        --format='{{.Name}} - {{.Config.Image}} - {{.State.Status}} - {{.State.Health.Status}}'

                    echo ""
                    echo "PostgreSQL:"
                    docker inspect "${POSTGRES_NAME}" \
                        --format='{{.Name}} - {{.State.Status}} - {{.State.Health.Status}}'

                    echo ""
                    echo "=========================================="
                    echo "             ✅ SUCCESS"
                    echo "=========================================="
                '''
            }
        }
    }

    post {

        success {
            echo '✅ Clarity déployé avec succès.'
        }

        failure {
            echo '❌ DEPLOYMENT FAILED'

            sh '''
                echo ""
                echo "========== CONTAINERS =========="

                docker ps -a \
                    --format 'table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}' \
                    || true

                echo ""
                echo "========== APP LOGS =========="

                docker logs --tail 250 \
                    "${APP_NAME}" \
                    2>/dev/null || true

                echo ""
                echo "========== POSTGRES LOGS =========="

                docker logs --tail 150 \
                    "${POSTGRES_NAME}" \
                    2>/dev/null || true
            '''
        }

        always {
            echo '📋 Pipeline terminé.'
        }
    }
}
