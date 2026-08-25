pipeline {

    agent any

    environment {
        APP_NAME = 'prometric-app'
        POSTGRES_NAME = 'prometric-postgres'
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
                    set -e

                    echo "======================================"
                    echo " GitHub → Jenkins"
                    echo "======================================"

                    test -f Dockerfile
                    test -f docker-compose.yml
                    test -f package.json

                    echo "Commit déployé :"
                    git rev-parse --short HEAD

                    echo "Code récupéré"
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

                    docker compose build --pull --no-cache app

                    echo "Image construite"
                '''
            }
        }

        stage('START POSTGRES') {
            steps {
                sh '''
                    set -e

                    echo "======================================"
                    echo " PostgreSQL"
                    echo "======================================"

                    if docker inspect "${POSTGRES_NAME}" >/dev/null 2>&1; then

                        echo "PostgreSQL existe déjà"

                        RUNNING=$(docker inspect \
                            -f '{{.State.Running}}' \
                            "${POSTGRES_NAME}")

                        if [ "$RUNNING" != "true" ]; then
                            docker start "${POSTGRES_NAME}"
                        fi

                    else

                        echo "PostgreSQL absent → création"

                        docker compose up -d postgres
                    fi

                    echo "PostgreSQL OK"
                '''
            }
        }

        stage('DEPLOY APP') {
            steps {
                sh '''
                    set -e

                    echo "======================================"
                    echo " CLARITY RECREATE"
                    echo "======================================"

                    echo "Suppression de l'ancien conteneur..."

                    docker rm -f "${APP_NAME}" 2>/dev/null || true

                    echo "Création du nouveau conteneur..."

                    docker compose up -d --no-deps --force-recreate app

                    echo "Nouveau conteneur créé"
                '''
            }
        }

        stage('VERIFY') {
            steps {
                sh '''
                    set -e

                    echo "======================================"
                    echo " Vérification"
                    echo "======================================"

                    sleep 10

                    echo ""
                    echo "===== CLARITY ====="

                    docker ps --filter "name=${APP_NAME}"

                    echo ""
                    echo "===== POSTGRES ====="

                    docker ps --filter "name=${POSTGRES_NAME}"

                    STATUS=$(docker inspect \
                        -f '{{.State.Status}}' \
                        "${APP_NAME}")

                    if [ "$STATUS" != "running" ]; then

                        echo "CLARITY n'est pas démarrée"

                        docker logs --tail 200 "${APP_NAME}" || true

                        exit 1
                    fi

                    echo ""
                    echo "CLARITY fonctionne"
                '''
            }
        }
    }

    post {

        success {
            echo '======================================'
            echo ' DEPLOYMENT SUCCESS'
            echo '======================================'
        }

        failure {
            echo '======================================'
            echo ' DEPLOYMENT FAILED'
            echo '======================================'

            sh '''
                echo "===== CLARITY ====="
                docker ps -a --filter "name=prometric-app" || true

                echo ""
                echo "===== POSTGRES ====="
                docker ps -a --filter "name=prometric-postgres" || true

                echo ""
                echo "===== CLARITY LOGS ====="
                docker logs --tail 200 prometric-app 2>/dev/null || true
            '''
        }

        always {
            echo 'Pipeline terminé — aucun nettoyage Docker global effectué.'
        }
    }
}
