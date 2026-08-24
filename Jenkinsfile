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
            echo " PostgreSQL"
            echo "======================================"

            if docker inspect prometric-postgres >/dev/null 2>&1; then
                echo "✅ prometric-postgres existe déjà"

                if [ "$(docker inspect -f '{{.State.Running}}' prometric-postgres)" != "true" ]; then
                    echo "🚀 Démarrage PostgreSQL..."
                    docker start prometric-postgres
                fi
            else
                echo "🚀 Création PostgreSQL..."
                docker compose up -d postgres
            fi

            echo "======================================"
            echo " Application"
            echo "======================================"

            echo "🛑 Suppression ancienne application..."
            docker rm -f prometric-app 2>/dev/null || true

            echo "🚀 Démarrage nouvelle application..."
            docker compose up -d --no-deps app

            echo "======================================"
            echo " Vérification"
            echo "======================================"

            sleep 5

            docker ps --filter name=prometric-postgres
            docker ps --filter name=prometric-app

            echo "======================================"
            echo " Logs application"
            echo "======================================"

            docker logs --tail 50 prometric-app

            echo "✅ Déploiement terminé"
        '''
    }
}
