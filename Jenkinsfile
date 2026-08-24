pipeline {

    agent any

    environment {
        COMPOSE_PROJECT_NAME = 'prometric'
        APP_CONTAINER = 'prometric-app'
        POSTGRES_CONTAINER = 'prometric-postgres'
        APP_IMAGE = 'prometric-dash-corrected-app:latest'
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

        stage('1 - Clean Workspace') {
            steps {
                echo '🧹 Nettoyage du workspace Jenkins...'
                deleteDir()
            }
        }

        stage('2 - Checkout GitHub') {
            steps {
                echo '📥 Clonage de Clarity depuis GitHub...'

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

                    echo "📁 Repository:"
                    pwd
                    ls -la

                    test -f Dockerfile || {
                        echo "❌ Dockerfile introuvable"
                        exit 1
                    }

                    test -f docker-compose.yml || {
                        echo "❌ docker-compose.yml introuvable"
                        exit 1
                    }

                    test -f package.json || {
                        echo "❌ package.json introuvable"
                        exit 1
                    }

                    test -f package-lock.json || {
                        echo "❌ package-lock.json introuvable"
                        exit 1
                    }

                    echo "✅ Fichiers nécessaires présents"
                '''
            }
        }

        stage('3 - Check Docker') {
            steps {
                sh '''
                    set -e

                    echo "🐳 Docker:"
                    docker --version

                    echo "🐳 Compose:"
                    docker compose version

                    echo ""
                    echo "📦 Conteneurs actuels:"
                    docker ps -a \
                        --format 'table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}'
                '''
            }
        }

        stage('4 - Prepare Network') {
            steps {
                sh '''
                    set -e

                    echo "🌐 Vérification de shared_network..."

                    if docker network inspect shared_network >/dev/null 2>&1; then
                        echo "✅ shared_network existe"
                    else
                        echo "⚠️ shared_network absent"
                        echo "Création..."

                        docker network create shared_network
                    fi
                '''
            }
        }

        stage('5 - Validate Compose') {
            steps {
                sh '''
                    set -e

                    echo "🔍 Validation docker-compose.yml..."

                    docker compose config

                    echo "✅ Compose valide"
                '''
            }
        }

        stage('6 - Build Docker') {
            steps {
                echo '🔨 Construction de l’image Clarity...'

                sh '''
                    set -e

                    echo "🐳 Build Docker..."

                    docker compose build --pull

                    echo ""
                    echo "✅ Build terminé"

                    docker images \
                        --format 'table {{.Repository}}\\t{{.Tag}}\\t{{.ID}}\\t{{.CreatedSince}}' \
                        | grep -E 'prometric|REPOSITORY' || true
                '''
            }
        }

        stage('7 - Start PostgreSQL') {
            steps {
                echo '🐘 Vérification PostgreSQL...'

                sh '''
                    set -e

                    docker compose up -d postgres

                    echo "⏳ Attente PostgreSQL..."

                    for i in $(seq 1 30); do

                        STATUS=$(docker inspect \
                            --format='{{.State.Health.Status}}' \
                            ${POSTGRES_CONTAINER} 2>/dev/null || echo "starting")

                        echo "PostgreSQL: $STATUS"

                        if [ "$STATUS" = "healthy" ]; then
                            echo "✅ PostgreSQL healthy"
                            break
                        fi

                        if [ "$i" -eq 30 ]; then
                            echo "❌ PostgreSQL n'est pas healthy"
                            docker logs --tail 150 ${POSTGRES_CONTAINER} || true
                            exit 1
                        fi

                        sleep 2
                    done
                '''
            }
        }

        stage('8 - Replace Application') {
            steps {
                echo '🚀 Déploiement de la nouvelle application...'

                sh '''
                    set -e

                    echo "🛑 Arrêt de l'ancien conteneur..."

                    docker compose stop app 2>/dev/null || true

                    echo "🗑️ Suppression de l'ancien conteneur..."

                    docker rm -f ${APP_CONTAINER} 2>/dev/null || true

                    echo "🚀 Démarrage de la nouvelle version..."

                    docker compose up -d app

                    echo "✅ Nouvelle application démarrée"
                '''
            }
        }

        stage('9 - Application Health Check') {
            steps {
                echo '🔍 Vérification de l’application...'

                sh '''
                    set -e

                    echo "⏳ Attente du healthcheck..."

                    for i in $(seq 1 30); do

                        STATUS=$(docker inspect \
                            --format='{{.State.Health.Status}}' \
                            ${APP_CONTAINER} 2>/dev/null || echo "starting")

                        echo "Application: $STATUS"

                        if [ "$STATUS" = "healthy" ]; then
                            echo "✅ Application healthy"
                            break
                        fi

                        if [ "$i" -eq 30 ]; then
                            echo "❌ Application non healthy"

                            docker logs --tail 200 ${APP_CONTAINER} || true

                            exit 1
                        fi

                        sleep 2
                    done

                    echo ""
                    echo "🌐 Test API /api/health..."

                    curl --fail --silent --show-error \
                        http://127.0.0.1:3000/api/health

                    echo ""
                    echo "✅ /api/health OK"
                '''
            }
        }

        stage('10 - Cleanup Old Docker Images') {
            steps {
                echo '🧹 Nettoyage des anciennes images...'

                sh '''
                    set -e

                    echo "Images avant nettoyage:"
                    docker images

                    echo ""
                    echo "🧹 Suppression des images dangling..."

                    docker image prune -f

                    echo ""
                    echo "Images après nettoyage:"
                    docker images
                '''
            }
        }

        stage('11 - Final Verification') {
            steps {
                sh '''
                    echo "=========================================="
                    echo "       CLARITY DEPLOYMENT"
                    echo "=========================================="

                    echo ""
                    echo "📦 Containers:"
                    docker ps \
                        --format 'table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}'

                    echo ""
                    echo "🐳 Application image:"
                    docker image inspect ${APP_IMAGE} \
                        --format '{{.RepoTags}} - {{.Id}}' || true

                    echo ""
                    echo "🐘 PostgreSQL volume:"
                    docker volume inspect prometric-postgres-data \
                        --format '{{.Name}}' || true

                    echo ""
                    echo "=========================================="
                    echo "       ✅ DEPLOYMENT SUCCESS"
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
            echo '❌ Échec du déploiement Clarity.'

            sh '''
                echo ""
                echo "===== CONTAINERS ====="

                docker ps -a \
                    --format 'table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}' \
                    || true

                echo ""
                echo "===== PROMETRIC APP LOGS ====="

                docker logs --tail 200 ${APP_CONTAINER} 2>/dev/null || true

                echo ""
                echo "===== POSTGRES LOGS ====="

                docker logs --tail 100 ${POSTGRES_CONTAINER} 2>/dev/null || true
            '''
        }

        always {
            echo '📋 Pipeline terminé.'
        }
    }
}
