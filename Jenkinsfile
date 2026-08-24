pipeline {

    agent any

    environment {
        APP_NAME = 'prometric-app'
        POSTGRES_NAME = 'prometric-postgres'
        COMPOSE_FILE = 'docker-compose.yml'
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

        stage('COPY FROM GITHUB') {
            steps {
                deleteDir()

                echo '======================================'
                echo ' GitHub → Jenkins'
                echo '======================================'

                checkout([
                    $class: 'GitSCM',
                    branches: [[name: '*/main']],
                    userRemoteConfigs: [[
                        url: 'https://github.com/dev-lab2026/clarity.git',
                        credentialsId: 'github-credentials'
                    ]]
                ])

                sh '''
                    set -e

                    echo "📁 Repository:"
                    pwd
                    ls -la

                    echo ""
                    echo "📄 Fichiers Docker:"
                    test -f Dockerfile
                    test -f docker-compose.yml
                    test -f package.json

                    echo "✅ Repository récupéré"
                '''
            }
        }

        stage('DOCKER BUILD') {
            steps {
                sh '''
                    set -e

                    echo '======================================'
                    echo ' Docker Build'
                    echo '======================================'

                    docker compose build --pull app

                    echo ""
                    echo "🔎 Vérification image..."

                    docker image inspect prometric-dash-corrected-app:latest >/dev/null

                    echo "✅ Image Docker construite"
                '''
            }
        }

        stage('DATABASE') {
            steps {
                sh '''
                    set -e

                    echo '======================================'
                    echo ' PostgreSQL'
                    echo '======================================'

                    if docker inspect "${POSTGRES_NAME}" >/dev/null 2>&1; then

                        echo "✅ Container ${POSTGRES_NAME} existe déjà"

                        RUNNING=$(docker inspect \
                            -f '{{.State.Running}}' \
                            "${POSTGRES_NAME}")

                        if [ "$RUNNING" != "true" ]; then
                            echo "🚀 PostgreSQL arrêté → démarrage..."
                            docker start "${POSTGRES_NAME}"
                        else
                            echo "✅ PostgreSQL déjà démarré"
                        fi

                    else

                        echo "🚀 Container PostgreSQL absent"
                        echo "Création avec Docker Compose..."

                        docker compose up -d postgres

                    fi

                    echo ""
                    echo "⏳ Vérification PostgreSQL..."

                    sleep 5

                    docker inspect \
                        -f '{{.State.Status}}' \
                        "${POSTGRES_NAME}"

                    echo "✅ PostgreSQL disponible"
                '''
            }
        }

        stage('DEPLOY APP') {
            steps {
                sh '''
                    set -e

                    echo '======================================'
                    echo ' Déploiement Application'
                    echo '======================================'

                    echo "🛑 Suppression ancienne application..."

                    docker rm -f "${APP_NAME}" 2>/dev/null || true

                    echo "🚀 Démarrage nouvelle application..."

                    docker compose up -d --no-deps app

                    echo "✅ Application démarrée"
                '''
            }
        }

        stage('HEALTH CHECK') {
            steps {
                sh '''
                    set -e

                    echo '======================================'
                    echo ' Health Check'
                    echo '======================================'

                    echo "⏳ Attente du démarrage..."
                    sleep 10

                    echo ""
                    echo "📦 Containers:"
                    docker ps --filter "name=${APP_NAME}"
                    docker ps --filter "name=${POSTGRES_NAME}"

                    echo ""
                    echo "🔎 État application:"

                    STATUS=$(docker inspect \
                        -f '{{.State.Status}}' \
                        "${APP_NAME}")

                    if [ "$STATUS" != "running" ]; then
                        echo "❌ Application non démarrée"

                        docker logs --tail 200 "${APP_NAME}" || true

                        exit 1
                    fi

                    echo "✅ Application running"

                    echo ""
                    echo "❤️ Health API:"

                    if docker exec "${APP_NAME}" \
                        node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{console.log('HTTP '+r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e);process.exit(1)})"
                    then
                        echo "✅ Health check OK"
                    else
                        echo "⚠️ Health endpoint indisponible"

                        docker logs --tail 100 "${APP_NAME}" || true

                        exit 1
                    fi
                '''
            }
        }

        stage('CLEANUP') {
            steps {
                sh '''
                    set -e

                    echo '======================================'
                    echo ' Docker Cleanup'
                    echo '======================================'

                    echo "🧹 Suppression des containers arrêtés..."
                    docker container prune -f

                    echo ""
                    echo "🧹 Suppression des images inutilisées..."
                    docker image prune -f

                    echo ""
                    echo "⚠️ PostgreSQL et son volume ne sont PAS supprimés"

                    echo ""
                    echo "📦 Containers actifs:"
                    docker ps

                    echo ""
                    echo "💾 Volumes:"
                    docker volume ls | grep prometric || true

                    echo "✅ Nettoyage terminé"
                '''
            }
        }
    }

    post {

        success {
            echo '''
            ======================================
            ✅ DEPLOYMENT SUCCESS
            ======================================
            '''
        }

        failure {
            echo '''
            ======================================
            ❌ DEPLOYMENT FAILED
            ======================================
            '''

            sh '''
                echo "===== CONTAINERS ====="
                docker ps -a || true

                echo ""
                echo "===== APP LOGS ====="
                docker logs --tail 200 "${APP_NAME}" 2>/dev/null || true

                echo ""
                echo "===== POSTGRES LOGS ====="
                docker logs --tail 100 "${POSTGRES_NAME}" 2>/dev/null || true
            '''
        }

        always {
            echo '📋 Pipeline terminé'
        }
    }
}
