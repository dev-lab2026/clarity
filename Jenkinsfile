
pipeline {
    agent any

    environment {
        APP_NAME = 'prometric-app'
        POSTGRES_NAME = 'prometric-postgres'
        COMPOSE_PROJECT_NAME = 'clarity'
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

        stage('CHECKOUT') {
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
                    set -eu

                    echo "=== GITHUB CHECKOUT ==="

                    test -f Dockerfile
                    test -f docker-compose.yml
                    test -f package.json

                    echo "Commit:"
                    git rev-parse --short HEAD

                    echo "Validation Docker Compose:"
                    docker compose -p clarity config -q
                '''
            }
        }

        stage('BUILD') {
            steps {
                sh '''
                    set -eu

                    echo "=== BUILD CLARITY ==="

                    docker compose -p clarity build app

                    echo "Build terminé"
                '''
            }
        }

        stage('START POSTGRES') {
            steps {
                sh '''
                    set -eu

                    echo "=== POSTGRESQL ==="

                    if docker inspect "$POSTGRES_NAME" >/dev/null 2>&1; then
                        echo "PostgreSQL existe"

                        RUNNING=$(docker inspect \
                            -f '{{.State.Running}}' "$POSTGRES_NAME")

                        if [ "$RUNNING" != "true" ]; then
                            docker start "$POSTGRES_NAME"
                        fi
                    else
                        echo "Création PostgreSQL via Compose"

                        docker compose -p clarity up -d postgres
                    fi

                    echo "Attente PostgreSQL..."

                    READY=false

                    for i in $(seq 1 30); do
                        if docker exec "$POSTGRES_NAME" pg_isready -q; then
                            READY=true
                            break
                        fi

                        sleep 2
                    done

                    if [ "$READY" != "true" ]; then
                        echo "PostgreSQL ne répond pas"
                        docker logs --tail 100 "$POSTGRES_NAME" || true
                        exit 1
                    fi

                    echo "PostgreSQL opérationnel"
                '''
            }
        }

        stage('DEPLOY CLARITY') {
            steps {
                sh '''
                    set -eu

                    echo "=== DEPLOY CLARITY ==="

                    docker compose -p clarity up -d \
                        --no-deps \
                        --force-recreate \
                        app

                    echo "Conteneur recréé"
                '''
            }
        }

        stage('HEALTH CHECK') {
            steps {
                sh '''
                    set -eu

                    echo "=== HEALTH CHECK ==="

                    READY=false

                    for i in $(seq 1 30); do

                        STATUS=$(docker inspect \
                            -f '{{.State.Status}}' "$APP_NAME" 2>/dev/null || echo missing)

                        HEALTH=$(docker inspect \
                            -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
                            "$APP_NAME" 2>/dev/null || echo missing)

                        echo "Status=$STATUS Health=$HEALTH"

                        if [ "$STATUS" = "running" ]; then
                            if [ "$HEALTH" = "healthy" ] || [ "$HEALTH" = "none" ]; then
                                READY=true
                                break
                            fi

                            if [ "$HEALTH" = "unhealthy" ]; then
                                break
                            fi
                        fi

                        sleep 2
                    done

                    if [ "$READY" != "true" ]; then
                        echo "ECHEC DU DEPLOIEMENT"

                        docker ps -a --filter "name=$APP_NAME"
                        docker logs --tail 200 "$APP_NAME" || true

                        exit 1
                    fi

                    echo "=== CONTENEURS ==="
                    docker ps --filter "name=$APP_NAME"
                    docker ps --filter "name=$POSTGRES_NAME"

                    echo "Clarity démarrée"
                '''
            }
        }
    }

    post {
        success {
            echo '''
            =====================================
              CLARITY DEPLOYMENT SUCCESS
            =====================================
            '''
        }

        failure {
            echo '''
            =====================================
              CLARITY DEPLOYMENT FAILED
            =====================================
            '''

            sh '''
                echo "=== APP ==="
                docker ps -a --filter "name=prometric-app" || true

                echo "=== POSTGRES ==="
                docker ps -a --filter "name=prometric-postgres" || true

                echo "=== APP LOGS ==="
                docker logs --tail 200 prometric-app 2>/dev/null || true
            '''
        }

        always {
            echo 'Pipeline terminé. Aucun nettoyage global Docker.'
        }
    }
}
