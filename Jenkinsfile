pipeline {

    agent any

    environment {
        APP_NAME = 'prometric-app'
        APP_IMAGE = 'prometric-dash-corrected-app:latest'
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

                checkout([
                    $class: 'GitSCM',
                    branches: [[name: '*/main']],
                    userRemoteConfigs: [[
                        url: 'https://github.com/dev-lab2026/clarity.git',
                        credentialsId: 'github-credentials'
                    ]]
                ])

                sh '''
                    echo "======================================"
                    echo " GitHub → Jenkins"
                    echo "======================================"
                    pwd
                    ls -la
                '''
            }
        }

        stage('DOCKER BUILD') {
            steps {
                sh '''
                    set -e

                    echo "======================================"
                    echo " Docker Build"
                    echo "======================================"

                    docker compose build --pull app

                    echo "✅ Docker build terminé"
                '''
            }
        }

        stage('DOCKER UP') {
            steps {
                sh '''
                    set -e

                    echo "======================================"
                    echo " Docker Up"
                    echo "======================================"

                    # PostgreSQL reste intact avec son volume
                    docker compose up -d postgres

                    # Remplace uniquement l'application
                    docker rm -f "${APP_NAME}" 2>/dev/null || true

                    docker compose up -d --no-deps app

                    echo "✅ Application démarrée"
                '''
            }
        }

        stage('CLEANUP') {
            steps {
                sh '''
                    set -e

                    echo "======================================"
                    echo " Docker Cleanup"
                    echo "======================================"

                    # Containers arrêtés
                    docker container prune -f

                    # Images inutilisées
                    docker image prune -f

                    echo "✅ Nettoyage terminé"
                '''
            }
        }
    }

    post {

        success {
            echo '✅ DEPLOYMENT SUCCESS'
        }

        failure {
            echo '❌ DEPLOYMENT FAILED'

            sh '''
                echo "===== CONTAINERS ====="
                docker ps -a || true

                echo "===== APP LOGS ====="
                docker logs --tail 200 "${APP_NAME}" 2>/dev/null || true
            '''
        }
    }
}
