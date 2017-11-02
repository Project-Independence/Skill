SKILL_NAME=$1
cd $SKILL_NAME
zip -f -r  ../package.zip *
cd ..
aws lambda update-function-code --function-name $SKILL_NAME --zip-file fileb://package.zip