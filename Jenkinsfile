pipeline {

    agent any

    environment {
        APP_NAME = 'clarity'
        IMAGE_NAME = 'clarity:latest'
        CONTAINER_NAME = 'clarity'
        GITHUB_REPO = 'https://github.com/dev-lab2026/clarity.git'
        GITHUB_CREDENTIALS = credentials('github-credentials')
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

        stage('Cleanup Workspace') {
            steps {
                echo '🧹 Nettoyage du workspace Jenkins...'

                deleteDir()
            }
        }

        stage('Checkout GitHub') {
            steps {
                echo '📥 Récupération du code depuis GitHub...'

                checkout([
                    $class: 'GitSCM',
                    branches: [[name: '*/main']],
                    userRemoteConfigs: [[
                        url: "${GITHUB_REPO}",
                        credentialsId: 'github-credentials'
                    ]]
                ])

                sh '''
                    echo "📁 Contenu du projet:"
                    ls -la

                    echo ""
                    echo "🔎 Vérification Dockerfile..."

                    if [ ! -f Dockerfile ]; then
                        echo "❌ Dockerfile introuvable"
                        exit 1
                    fi

                    echo "✅ Dockerfile trouvé"
                '''
            }
        }

        stage('Docker Build') {
            steps {
                echo '🐳 Construction de l’image Docker Clarity...'

                sh '''
                    set -e

                    echo "🔨 Docker build..."

                    docker build \
                        --pull \
                        --no-cache \
                        -t ${IMAGE_NAME} .

                    echo "✅ Image Docker construite"

                    docker images | grep clarity || true
                '''
            }
        }

        stage('Stop Old Container') {
            steps {
                echo '🛑 Arrêt de l’ancien conteneur...'

                sh '''
                    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
                        echo "Ancien conteneur trouvé"

                        docker stop ${CONTAINER_NAME} || true
                        docker rm ${CONTAINER_NAME} || true

                        echo "✅ Ancien conteneur supprimé"
                    else
                        echo "ℹ️ Aucun ancien conteneur"
                    fi
                '''
            }
        }

        stage('Cleanup Old Docker Images') {
            steps {
                echo '🧹 Nettoyage des anciennes images Docker...'

                sh '''
                    echo "Suppression des images Clarity précédentes..."

                    docker image prune -f

                    echo "Suppression des images dangling..."

                    docker image prune -f

                    echo "📦 Images restantes:"
                    docker images
                '''
            }
        }

        stage('Run New Container') {
            steps {
                echo '🚀 Démarrage du nouveau conteneur Clarity...'

                sh '''
                    set -e

                    docker run -d \
                        --name ${CONTAINER_NAME} \
                        --restart unless-stopped \
                        -p 3000:3000 \
                        ${IMAGE_NAME}

                    echo "✅ Conteneur démarré"

                    sleep 5

                    docker ps --filter "name=${CONTAINER_NAME}"

                    echo ""
                    echo "📋 Logs du conteneur:"
                    docker logs --tail 50 ${CONTAINER_NAME}
                '''
            }
        }

        stage('Health Check') {
            steps {
                echo '🔍 Vérification du conteneur...'

                sh '''
                    set -e

                    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
                        echo "❌ Clarity ne fonctionne pas"
                        docker logs ${CONTAINER_NAME} || true
                        exit 1
                    fi

                    echo "✅ Clarity est démarré"
                '''
            }
        }
    }

    post {

        success {
            echo '======================================'
            echo '✅ CLARITY DEPLOYED SUCCESSFULLY'
            echo '======================================'
        }

        failure {
            echo '======================================'
            echo '❌ CLARITY DEPLOYMENT FAILED'
            echo '======================================'

            sh '''
                echo "📋 Docker containers:"
                docker ps -a || true

                echo ""
                echo "📋 Clarity logs:"
                docker logs --tail 100 ${CONTAINER_NAME} 2>/dev/null || true
            '''
        }

        always {
            echo '📋 Pipeline terminé'
        }
    }
}
