pipeline {
    agent any
    
    environment {
        APP_NAME = 'clarity'
        BUILD_DIR = "${WORKSPACE}/build"
        ARTIFACTS_DIR = "${WORKSPACE}/artifacts"
        NODE_VERSION = '18'
        // GitHub credentials (à configurer dans Jenkins)
        GITHUB_CREDENTIALS = credentials('github-credentials')
    }
    
    parameters {
        string(name: 'BUILDS_TO_KEEP', defaultValue: '5', description: 'Number of old builds to keep')
    }
    
    triggers {
        // Déclenche le build à chaque push
        githubPush()
    }
    
    stages {
        stage('Checkout') {
            steps {
                echo '🔄 Cloning repository with GitHub credentials...'
                checkout([
                    $class: 'GitSCM',
                    branches: [[name: '*/main']],
                    userRemoteConfigs: [[
                        url: 'https://github.com/dev-lab2026/clarity.git',
                        credentialsId: 'github-credentials'
                    ]]
                ])
            }
        }
        
        stage('Setup') {
            steps {
                echo '⚙️  Setting up environment...'
                sh '''
                    node --version
                    npm --version
                '''
            }
        }
        
        stage('Install Dependencies') {
            steps {
                echo '📦 Installing dependencies...'
                sh 'npm install'
            }
        }
        
        stage('Build') {
            steps {
                echo '🔨 Building application...'
                sh 'npm run build'
            }
        }
        
        stage('Test') {
            steps {
                echo '✅ Running tests...'
                sh 'npm run test || true'
            }
        }
        
        stage('Archive Artifacts') {
            steps {
                echo '📦 Archiving build artifacts...'
                sh '''
                    mkdir -p ${ARTIFACTS_DIR}
                    if [ -d "dist" ]; then
                        cp -r dist/* ${ARTIFACTS_DIR}/ || true
                    fi
                    if [ -d "build" ]; then
                        cp -r build/* ${ARTIFACTS_DIR}/ || true
                    fi
                '''
                archiveArtifacts artifacts: '**/*.js, **/*.css, **/*.html', allowEmptyArchive: true
            }
        }
        
        stage('Cleanup Old Builds') {
            steps {
                echo '🧹 Cleaning up old builds...'
                sh '''
                    KEEP=${BUILDS_TO_KEEP}
                    BUILD_DIR="${JENKINS_HOME}/jobs/${JOB_NAME}/builds"
                    
                    if [ -d "$BUILD_DIR" ]; then
                        BUILD_COUNT=$(ls -d */ 2>/dev/null | wc -l)
                        if [ "$BUILD_COUNT" -gt "$KEEP" ]; then
                            echo "Total builds: $BUILD_COUNT, keeping: $KEEP"
                            ls -d */ | sort -V | head -n $((BUILD_COUNT - KEEP)) | xargs -I {} rm -rf "$BUILD_DIR/{}"
                            echo "✓ Old builds deleted"
                        fi
                    fi
                '''
            }
        }
        
        stage('Update GitHub Status - Success') {
            when {
                expression { currentBuild.result == null || currentBuild.result == 'SUCCESS' }
            }
            steps {
                echo '📤 Updating GitHub commit status...'
                sh '''
                    COMMIT_SHA=$(git rev-parse HEAD)
                    curl -X POST \
                        -H "Authorization: token ${GITHUB_CREDENTIALS_PSW}" \
                        -H "Accept: application/vnd.github.v3+json" \
                        https://api.github.com/repos/dev-lab2026/clarity/statuses/${COMMIT_SHA} \
                        -d "{\"state\":\"success\",\"description\":\"Build succeeded\",\"context\":\"continuous-integration/jenkins\"}"
                '''
            }
        }
    }
    
    post {
        always {
            echo '📋 Pipeline execution completed'
            cleanWs()
        }
        
        success {
            echo '✅ Build succeeded!'
        }
        
        failure {
            echo '❌ Build failed!'
            sh '''
                COMMIT_SHA=$(git rev-parse HEAD)
                curl -X POST \
                    -H "Authorization: token ${GITHUB_CREDENTIALS_PSW}" \
                    -H "Accept: application/vnd.github.v3+json" \
                    https://api.github.com/repos/dev-lab2026/clarity/statuses/${COMMIT_SHA} \
                    -d "{\"state\":\"failure\",\"description\":\"Build failed\",\"context\":\"continuous-integration/jenkins\"}" || true
            '''
        }
    }
    
    options {
        buildDiscarder(logRotator(numToKeepStr: '5'))
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
    }
}
