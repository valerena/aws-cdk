"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const ec2 = require("aws-cdk-lib/aws-ec2");
const ecs = require("aws-cdk-lib/aws-ecs");
const elbv2 = require("aws-cdk-lib/aws-elasticloadbalancingv2");
const cdk = require("aws-cdk-lib");
const integ = require("@aws-cdk/integ-tests-alpha");
const codedeploy = require("aws-cdk-lib/aws-codedeploy");
/**
 * Follow these instructions to manually test running a CodeDeploy deployment with the resources provisioned in this stack:
 *
 * 1. Deploy the stack:
```
$ cdk deploy --app 'node integ.deployment-group.js' aws-cdk-codedeploy-ecs-dg
```
 *
 * 2. Create a file called `appspec.json` with the following contents, replacing the placeholders with output values from the deployed stack:
```
{
  "version": 0.0,
  "Resources": [
    {
      "TargetService": {
        "Type": "AWS::ECS::Service",
        "Properties": {
          "TaskDefinition": "<PLACEHOLDER - NEW TASK DEFINITION>",
          "LoadBalancerInfo": {
            "ContainerName": "Container",
            "ContainerPort": 80
          },
          "PlatformVersion": "LATEST",
          "NetworkConfiguration": {
            "awsvpcConfiguration": {
              "subnets": [
                "<PLACEHOLDER - SUBNET 1 ID>",
                "<PLACEHOLDER - SUBNET 2 ID>",
              ],
              "securityGroups": [
                "<PLACEHOLDER - SECURITY GROUP ID>"
              ],
              "assignPublicIp": "DISABLED"
            }
          }
        }
      }
    }
  ]
}
```
 *
 * 3. Start the deployment:
```
$ appspec=$(jq -R -s '.' < appspec.json | sed 's/\\n//g')
$ aws deploy create-deployment \
   --application-name <PLACEHOLDER - CODEDEPLOY APPLICATION NAME> \
   --deployment-group-name <PLACEHOLDER - CODEDEPLOY DEPLOYMENT GROUP NAME> \
   --description "AWS CDK integ test" \
   --revision revisionType=AppSpecContent,appSpecContent={content="$appspec"}
```
 *
 * 4. Wait for the deployment to complete successfully, providing the deployment ID from the previous step:
```
$ aws deploy wait deployment-successful --deployment-id <PLACEHOLDER - DEPLOYMENT ID>
```
 *
 * 5. Destroy the stack:
```
$ cdk destroy --app 'node integ.deployment-group.js' aws-cdk-codedeploy-ecs-dg
```
 */
const app = new cdk.App();
const stack = new cdk.Stack(app, 'aws-cdk-codedeploy-ecs-dg');
// Network infrastructure
const vpc = new ec2.Vpc(stack, 'VPC', { maxAzs: 2 });
// ECS service
const cluster = new ecs.Cluster(stack, 'EcsCluster', {
    vpc,
});
const taskDefinition = new ecs.FargateTaskDefinition(stack, 'TaskDef');
taskDefinition.addContainer('Container', {
    image: ecs.ContainerImage.fromRegistry('public.ecr.aws/ecs-sample-image/amazon-ecs-sample:latest'),
    portMappings: [{ containerPort: 80 }],
});
const service = new ecs.FargateService(stack, 'FargateService', {
    cluster,
    taskDefinition,
    deploymentController: {
        type: ecs.DeploymentControllerType.CODE_DEPLOY,
    },
});
// A second task definition for testing a CodeDeploy deployment of the ECS service to a new task definition
const taskDefinition2 = new ecs.FargateTaskDefinition(stack, 'TaskDef2');
taskDefinition2.addContainer('Container', {
    image: ecs.ContainerImage.fromRegistry('public.ecr.aws/ecs-sample-image/amazon-ecs-sample:latest'),
    portMappings: [{ containerPort: 80 }],
});
service.node.addDependency(taskDefinition2);
// Load balancer
const loadBalancer = new elbv2.ApplicationLoadBalancer(stack, 'ServiceLB', {
    vpc,
    internetFacing: false,
});
// Listeners
const prodListener = loadBalancer.addListener('ProdListener', {
    port: 80,
    protocol: elbv2.ApplicationProtocol.HTTP,
});
const testListener = loadBalancer.addListener('TestListener', {
    port: 9002,
    protocol: elbv2.ApplicationProtocol.HTTP,
});
// Target groups
const blueTG = prodListener.addTargets('BlueTG', {
    port: 80,
    protocol: elbv2.ApplicationProtocol.HTTP,
    targets: [
        service.loadBalancerTarget({
            containerName: 'Container',
            containerPort: 80,
        }),
    ],
    deregistrationDelay: cdk.Duration.seconds(30),
    healthCheck: {
        interval: cdk.Duration.seconds(5),
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: cdk.Duration.seconds(4),
    },
});
const greenTG = new elbv2.ApplicationTargetGroup(stack, 'GreenTG', {
    vpc,
    port: 80,
    protocol: elbv2.ApplicationProtocol.HTTP,
    targetType: elbv2.TargetType.IP,
    deregistrationDelay: cdk.Duration.seconds(30),
    healthCheck: {
        interval: cdk.Duration.seconds(5),
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: cdk.Duration.seconds(4),
    },
});
testListener.addTargetGroups('GreenTGTest', {
    targetGroups: [greenTG],
});
prodListener.node.addDependency(greenTG);
testListener.node.addDependency(blueTG);
service.node.addDependency(testListener);
service.node.addDependency(greenTG);
// Alarms: monitor 500s and unhealthy hosts on target groups
const blueUnhealthyHosts = new cloudwatch.Alarm(stack, 'BlueUnhealthyHosts', {
    alarmName: stack.stackName + '-Unhealthy-Hosts-Blue',
    metric: blueTG.metricUnhealthyHostCount(),
    threshold: 1,
    evaluationPeriods: 2,
});
const blueApiFailure = new cloudwatch.Alarm(stack, 'Blue5xx', {
    alarmName: stack.stackName + '-Http-500-Blue',
    metric: blueTG.metricHttpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, { period: cdk.Duration.minutes(1) }),
    threshold: 1,
    evaluationPeriods: 1,
});
const greenUnhealthyHosts = new cloudwatch.Alarm(stack, 'GreenUnhealthyHosts', {
    alarmName: stack.stackName + '-Unhealthy-Hosts-Green',
    metric: greenTG.metricUnhealthyHostCount(),
    threshold: 1,
    evaluationPeriods: 2,
});
const greenApiFailure = new cloudwatch.Alarm(stack, 'Green5xx', {
    alarmName: stack.stackName + '-Http-500-Green',
    metric: greenTG.metricHttpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, { period: cdk.Duration.minutes(1) }),
    threshold: 1,
    evaluationPeriods: 1,
});
// Deployment group
const deploymentConfig = new codedeploy.EcsDeploymentConfig(stack, 'CanaryConfig', {
    trafficRouting: codedeploy.TrafficRouting.timeBasedCanary({
        interval: cdk.Duration.minutes(1),
        percentage: 20,
    }),
});
const dg = new codedeploy.EcsDeploymentGroup(stack, 'BlueGreenDG', {
    alarms: [
        blueUnhealthyHosts,
        blueApiFailure,
        greenUnhealthyHosts,
        greenApiFailure,
    ],
    service,
    blueGreenDeploymentConfig: {
        blueTargetGroup: blueTG,
        greenTargetGroup: greenTG,
        listener: prodListener,
        testListener,
        terminationWaitTime: cdk.Duration.minutes(1),
    },
    deploymentConfig,
    autoRollback: {
        stoppedDeployment: true,
    },
});
// Outputs to use for manual testing
new cdk.CfnOutput(stack, 'NewTaskDefinition', { value: taskDefinition2.taskDefinitionArn });
new cdk.CfnOutput(stack, 'Subnet1Id', { value: vpc.privateSubnets[0].subnetId });
new cdk.CfnOutput(stack, 'Subnet2Id', { value: vpc.privateSubnets[1].subnetId });
new cdk.CfnOutput(stack, 'SecurityGroupId', { value: service.connections.securityGroups[0].securityGroupId });
new cdk.CfnOutput(stack, 'CodeDeployApplicationName', { value: dg.application.applicationName });
new cdk.CfnOutput(stack, 'CodeDeployDeploymentGroupName', { value: dg.deploymentGroupName });
new integ.IntegTest(app, 'EcsDeploymentGroupTest', {
    testCases: [stack],
});
app.synth();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZWcuZGVwbG95bWVudC1ncm91cC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImludGVnLmRlcGxveW1lbnQtZ3JvdXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSx5REFBeUQ7QUFDekQsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQyxnRUFBZ0U7QUFDaEUsbUNBQW1DO0FBQ25DLG9EQUFvRDtBQUNwRCx5REFBeUQ7QUFFekQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0E2REc7QUFFSCxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUMxQixNQUFNLEtBQUssR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLDJCQUEyQixDQUFDLENBQUM7QUFFOUQseUJBQXlCO0FBQ3pCLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFckQsY0FBYztBQUNkLE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsWUFBWSxFQUFFO0lBQ25ELEdBQUc7Q0FDSixDQUFDLENBQUM7QUFDSCxNQUFNLGNBQWMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7QUFDdkUsY0FBYyxDQUFDLFlBQVksQ0FBQyxXQUFXLEVBQUU7SUFDdkMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDLDBEQUEwRCxDQUFDO0lBQ2xHLFlBQVksRUFBRSxDQUFDLEVBQUUsYUFBYSxFQUFFLEVBQUUsRUFBRSxDQUFDO0NBQ3RDLENBQUMsQ0FBQztBQUNILE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxDQUFDLGNB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QUM7QUFFSCxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGVjcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNzJztcbmltcG9ydCAqIGFzIGVsYnYyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lbGFzdGljbG9hZGJhbGFuY2luZ3YyJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBpbnRlZyBmcm9tICdAYXdzLWNkay9pbnRlZy10ZXN0cy1hbHBoYSc7XG5pbXBvcnQgKiBhcyBjb2RlZGVwbG95IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2RlZGVwbG95JztcblxuLyoqXG4gKiBGb2xsb3cgdGhlc2UgaW5zdHJ1Y3Rpb25zIHRvIG1hbnVhbGx5IHRlc3QgcnVubmluZyBhIENvZGVEZXBsb3kgZGVwbG95bWVudCB3aXRoIHRoZSByZXNvdXJjZXMgcHJvdmlzaW9uZWQgaW4gdGhpcyBzdGFjazpcbiAqXG4gKiAxLiBEZXBsb3kgdGhlIHN0YWNrOlxuYGBgXG4kIGNkayBkZXBsb3kgLS1hcHAgJ25vZGUgaW50ZWcuZGVwbG95bWVudC1ncm91cC5qcycgYXdzLWNkay1jb2RlZGVwbG95LWVjcy1kZ1xuYGBgXG4gKlxuICogMi4gQ3JlYXRlIGEgZmlsZSBjYWxsZWQgYGFwcHNwZWMuanNvbmAgd2l0aCB0aGUgZm9sbG93aW5nIGNvbnRlbnRzLCByZXBsYWNpbmcgdGhlIHBsYWNlaG9sZGVycyB3aXRoIG91dHB1dCB2YWx1ZXMgZnJvbSB0aGUgZGVwbG95ZWQgc3RhY2s6XG5gYGBcbntcbiAgXCJ2ZXJzaW9uXCI6IDAuMCxcbiAgXCJSZXNvdXJjZXNcIjogW1xuICAgIHtcbiAgICAgIFwiVGFyZ2V0U2VydmljZVwiOiB7XG4gICAgICAgIFwiVHlwZVwiOiBcIkFXUzo6RUNTOjpTZXJ2aWNlXCIsXG4gICAgICAgIFwiUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCJUYXNrRGVmaW5pdGlvblwiOiBcIjxQTEFDRUhPTERFUiAtIE5FVyBUQVNLIERFRklOSVRJT04+XCIsXG4gICAgICAgICAgXCJMb2FkQmFsYW5jZXJJbmZvXCI6IHtcbiAgICAgICAgICAgIFwiQ29udGFpbmVyTmFtZVwiOiBcIkNvbnRhaW5lclwiLFxuICAgICAgICAgICAgXCJDb250YWluZXJQb3J0XCI6IDgwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIlBsYXRmb3JtVmVyc2lvblwiOiBcIkxBVEVTVFwiLFxuICAgICAgICAgIFwiTmV0d29ya0NvbmZpZ3VyYXRpb25cIjoge1xuICAgICAgICAgICAgXCJhd3N2cGNDb25maWd1cmF0aW9uXCI6IHtcbiAgICAgICAgICAgICAgXCJzdWJuZXRzXCI6IFtcbiAgICAgICAgICAgICAgICBcIjxQTEFDRUhPTERFUiAtIFNVQk5FVCAxIElEPlwiLFxuICAgICAgICAgICAgICAgIFwiPFBMQUNFSE9MREVSIC0gU1VCTkVUIDIgSUQ+XCIsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIFwic2VjdXJpdHlHcm91cHNcIjogW1xuICAgICAgICAgICAgICAgIFwiPFBMQUNFSE9MREVSIC0gU0VDVVJJVFkgR1JPVVAgSUQ+XCJcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgXCJhc3NpZ25QdWJsaWNJcFwiOiBcIkRJU0FCTEVEXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIF1cbn1cbmBgYFxuICpcbiAqIDMuIFN0YXJ0IHRoZSBkZXBsb3ltZW50OlxuYGBgXG4kIGFwcHNwZWM9JChqcSAtUiAtcyAnLicgPCBhcHBzcGVjLmpzb24gfCBzZWQgJ3MvXFxcXG4vL2cnKVxuJCBhd3MgZGVwbG95IGNyZWF0ZS1kZXBsb3ltZW50IFxcXG4gICAtLWFwcGxpY2F0aW9uLW5hbWUgPFBMQUNFSE9MREVSIC0gQ09ERURFUExPWSBBUFBMSUNBVElPTiBOQU1FPiBcXFxuICAgLS1kZXBsb3ltZW50LWdyb3VwLW5hbWUgPFBMQUNFSE9MREVSIC0gQ09ERURFUExPWSBERVBMT1lNRU5UIEdST1VQIE5BTUU+IFxcXG4gICAtLWRlc2NyaXB0aW9uIFwiQVdTIENESyBpbnRlZyB0ZXN0XCIgXFxcbiAgIC0tcmV2aXNpb24gcmV2aXNpb25UeXBlPUFwcFNwZWNDb250ZW50LGFwcFNwZWNDb250ZW50PXtjb250ZW50PVwiJGFwcHNwZWNcIn1cbmBgYFxuICpcbiAqIDQuIFdhaXQgZm9yIHRoZSBkZXBsb3ltZW50IHRvIGNvbXBsZXRlIHN1Y2Nlc3NmdWxseSwgcHJvdmlkaW5nIHRoZSBkZXBsb3ltZW50IElEIGZyb20gdGhlIHByZXZpb3VzIHN0ZXA6XG5gYGBcbiQgYXdzIGRlcGxveSB3YWl0IGRlcGxveW1lbnQtc3VjY2Vzc2Z1bCAtLWRlcGxveW1lbnQtaWQgPFBMQUNFSE9MREVSIC0gREVQTE9ZTUVOVCBJRD5cbmBgYFxuICpcbiAqIDUuIERlc3Ryb3kgdGhlIHN0YWNrOlxuYGBgXG4kIGNkayBkZXN0cm95IC0tYXBwICdub2RlIGludGVnLmRlcGxveW1lbnQtZ3JvdXAuanMnIGF3cy1jZGstY29kZWRlcGxveS1lY3MtZGdcbmBgYFxuICovXG5cbmNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG5jb25zdCBzdGFjayA9IG5ldyBjZGsuU3RhY2soYXBwLCAnYXdzLWNkay1jb2RlZGVwbG95LWVjcy1kZycpO1xuXG4vLyBOZXR3b3JrIGluZnJhc3RydWN0dXJlXG5jb25zdCB2cGMgPSBuZXcgZWMyLlZwYyhzdGFjaywgJ1ZQQycsIHsgbWF4QXpzOiAyIH0pO1xuXG4vLyBFQ1Mgc2VydmljZVxuY29uc3QgY2x1c3RlciA9IG5ldyBlY3MuQ2x1c3RlcihzdGFjaywgJ0Vjc0NsdXN0ZXInLCB7XG4gIHZwYyxcbn0pO1xuY29uc3QgdGFza0RlZmluaXRpb24gPSBuZXcgZWNzLkZhcmdhdGVUYXNrRGVmaW5pdGlvbihzdGFjaywgJ1Rhc2tEZWYnKTtcbnRhc2tEZWZpbml0aW9uLmFkZENvbnRhaW5lcignQ29udGFpbmVyJywge1xuICBpbWFnZTogZWNzLkNvbnRhaW5lckltYWdlLmZyb21SZWdpc3RyeSgncHVibGljLmVjci5hd3MvZWNzLXNhbXBsZS1pbWFnZS9hbWF6b24tZWNzLXNhbXBsZTpsYXRlc3QnKSxcbiAgcG9ydE1hcHBpbmdzOiBbeyBjb250YWluZXJQb3J0OiA4MCB9XSxcbn0pO1xuY29uc3Qgc2VydmljZSA9IG5ldyBlY3MuRmFyZ2F0ZVNlcnZpY2Uoc3RhY2ssICdGYXJnYXRlU2VydmljZScsIHtcbiAgY2x1c3RlcixcbiAgdGFza0RlZmluaXRpb24sXG4gIGRlcGxveW1lbnRDb250cm9sbGVyOiB7XG4gICAgdHlwZTogZWNzLkRlcGxveW1lbnRDb250cm9sbGVyVHlwZS5DT0RFX0RFUExPWSxcbiAgfSxcbn0pO1xuXG4vLyBBIHNlY29uZCB0YXNrIGRlZmluaXRpb24gZm9yIHRlc3RpbmcgYSBDb2RlRGVwbG95IGRlcGxveW1lbnQgb2YgdGhlIEVDUyBzZXJ2aWNlIHRvIGEgbmV3IHRhc2sgZGVmaW5pdGlvblxuY29uc3QgdGFza0RlZmluaXRpb24yID0gbmV3IGVjcy5GYXJnYXRlVGFza0RlZmluaXRpb24oc3RhY2ssICdUYXNrRGVmMicpO1xudGFza0RlZmluaXRpb24yLmFkZENvbnRhaW5lcignQ29udGFpbmVyJywge1xuICBpbWFnZTogZWNzLkNvbnRhaW5lckltYWdlLmZyb21SZWdpc3RyeSgncHVibGljLmVjci5hd3MvZWNzLXNhbXBsZS1pbWFnZS9hbWF6b24tZWNzLXNhbXBsZTpsYXRlc3QnKSxcbiAgcG9ydE1hcHBpbmdzOiBbeyBjb250YWluZXJQb3J0OiA4MCB9XSxcbn0pO1xuc2VydmljZS5ub2RlLmFkZERlcGVuZGVuY3kodGFza0RlZmluaXRpb24yKTtcblxuLy8gTG9hZCBiYWxhbmNlclxuY29uc3QgbG9hZEJhbGFuY2VyID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyKHN0YWNrLCAnU2VydmljZUxCJywge1xuICB2cGMsXG4gIGludGVybmV0RmFjaW5nOiBmYWxzZSxcbn0pO1xuXG4vLyBMaXN0ZW5lcnNcbmNvbnN0IHByb2RMaXN0ZW5lciA9IGxvYWRCYWxhbmNlci5hZGRMaXN0ZW5lcignUHJvZExpc3RlbmVyJywge1xuICBwb3J0OiA4MCwgLy8gcG9ydCBmb3IgcHJvZHVjdGlvbiB0cmFmZmljXG4gIHByb3RvY29sOiBlbGJ2Mi5BcHBsaWNhdGlvblByb3RvY29sLkhUVFAsXG59KTtcbmNvbnN0IHRlc3RMaXN0ZW5lciA9IGxvYWRCYWxhbmNlci5hZGRMaXN0ZW5lcignVGVzdExpc3RlbmVyJywge1xuICBwb3J0OiA5MDAyLCAvLyBwb3J0IGZvciB0ZXN0aW5nXG4gIHByb3RvY29sOiBlbGJ2Mi5BcHBsaWNhdGlvblByb3RvY29sLkhUVFAsXG59KTtcblxuLy8gVGFyZ2V0IGdyb3Vwc1xuY29uc3QgYmx1ZVRHID0gcHJvZExpc3RlbmVyLmFkZFRhcmdldHMoJ0JsdWVURycsIHtcbiAgcG9ydDogODAsXG4gIHByb3RvY29sOiBlbGJ2Mi5BcHBsaWNhdGlvblByb3RvY29sLkhUVFAsXG4gIHRhcmdldHM6IFtcbiAgICBzZXJ2aWNlLmxvYWRCYWxhbmNlclRhcmdldCh7XG4gICAgICBjb250YWluZXJOYW1lOiAnQ29udGFpbmVyJyxcbiAgICAgIGNvbnRhaW5lclBvcnQ6IDgwLFxuICAgIH0pLFxuICBdLFxuICBkZXJlZ2lzdHJhdGlvbkRlbGF5OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gIGhlYWx0aENoZWNrOiB7XG4gICAgaW50ZXJ2YWw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgIGhlYWx0aHlIdHRwQ29kZXM6ICcyMDAnLFxuICAgIGhlYWx0aHlUaHJlc2hvbGRDb3VudDogMixcbiAgICB1bmhlYWx0aHlUaHJlc2hvbGRDb3VudDogMyxcbiAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg0KSxcbiAgfSxcbn0pO1xuXG5jb25zdCBncmVlblRHID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAoc3RhY2ssICdHcmVlblRHJywge1xuICB2cGMsXG4gIHBvcnQ6IDgwLFxuICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxuICB0YXJnZXRUeXBlOiBlbGJ2Mi5UYXJnZXRUeXBlLklQLFxuICBkZXJlZ2lzdHJhdGlvbkRlbGF5OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gIGhlYWx0aENoZWNrOiB7XG4gICAgaW50ZXJ2YWw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgIGhlYWx0aHlIdHRwQ29kZXM6ICcyMDAnLFxuICAgIGhlYWx0aHlUaHJlc2hvbGRDb3VudDogMixcbiAgICB1bmhlYWx0aHlUaHJlc2hvbGRDb3VudDogMyxcbiAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg0KSxcbiAgfSxcbn0pO1xuXG50ZXN0TGlzdGVuZXIuYWRkVGFyZ2V0R3JvdXBzKCdHcmVlblRHVGVzdCcsIHtcbiAgdGFyZ2V0R3JvdXBzOiBbZ3JlZW5UR10sXG59KTtcblxucHJvZExpc3RlbmVyLm5vZGUuYWRkRGVwZW5kZW5jeShncmVlblRHKTtcbnRlc3RMaXN0ZW5lci5ub2RlLmFkZERlcGVuZGVuY3koYmx1ZVRHKTtcbnNlcnZpY2Uubm9kZS5hZGREZXBlbmRlbmN5KHRlc3RMaXN0ZW5lcik7XG5zZXJ2aWNlLm5vZGUuYWRkRGVwZW5kZW5jeShncmVlblRHKTtcblxuLy8gQWxhcm1zOiBtb25pdG9yIDUwMHMgYW5kIHVuaGVhbHRoeSBob3N0cyBvbiB0YXJnZXQgZ3JvdXBzXG5jb25zdCBibHVlVW5oZWFsdGh5SG9zdHMgPSBuZXcgY2xvdWR3YXRjaC5BbGFybShzdGFjaywgJ0JsdWVVbmhlYWx0aHlIb3N0cycsIHtcbiAgYWxhcm1OYW1lOiBzdGFjay5zdGFja05hbWUgKyAnLVVuaGVhbHRoeS1Ib3N0cy1CbHVlJyxcbiAgbWV0cmljOiBibHVlVEcubWV0cmljVW5oZWFsdGh5SG9zdENvdW50KCksXG4gIHRocmVzaG9sZDogMSxcbiAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXG59KTtcblxuY29uc3QgYmx1ZUFwaUZhaWx1cmUgPSBuZXcgY2xvdWR3YXRjaC5BbGFybShzdGFjaywgJ0JsdWU1eHgnLCB7XG4gIGFsYXJtTmFtZTogc3RhY2suc3RhY2tOYW1lICsgJy1IdHRwLTUwMC1CbHVlJyxcbiAgbWV0cmljOiBibHVlVEcubWV0cmljSHR0cENvZGVUYXJnZXQoXG4gICAgZWxidjIuSHR0cENvZGVUYXJnZXQuVEFSR0VUXzVYWF9DT1VOVCxcbiAgICB7IHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSkgfSxcbiAgKSxcbiAgdGhyZXNob2xkOiAxLFxuICBldmFsdWF0aW9uUGVyaW9kczogMSxcbn0pO1xuXG5jb25zdCBncmVlblVuaGVhbHRoeUhvc3RzID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0oc3RhY2ssICdHcmVlblVuaGVhbHRoeUhvc3RzJywge1xuICBhbGFybU5hbWU6IHN0YWNrLnN0YWNrTmFtZSArICctVW5oZWFsdGh5LUhvc3RzLUdyZWVuJyxcbiAgbWV0cmljOiBncmVlblRHLm1ldHJpY1VuaGVhbHRoeUhvc3RDb3VudCgpLFxuICB0aHJlc2hvbGQ6IDEsXG4gIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxufSk7XG5cbmNvbnN0IGdyZWVuQXBpRmFpbHVyZSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHN0YWNrLCAnR3JlZW41eHgnLCB7XG4gIGFsYXJtTmFtZTogc3RhY2suc3RhY2tOYW1lICsgJy1IdHRwLTUwMC1HcmVlbicsXG4gIG1ldHJpYzogZ3JlZW5URy5tZXRyaWNIdHRwQ29kZVRhcmdldChcbiAgICBlbGJ2Mi5IdHRwQ29kZVRhcmdldC5UQVJHRVRfNVhYX0NPVU5ULFxuICAgIHsgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcygxKSB9LFxuICApLFxuICB0aHJlc2hvbGQ6IDEsXG4gIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxufSk7XG5cbi8vIERlcGxveW1lbnQgZ3JvdXBcbmNvbnN0IGRlcGxveW1lbnRDb25maWcgPSBuZXcgY29kZWRlcGxveS5FY3NEZXBsb3ltZW50Q29uZmlnKHN0YWNrLCAnQ2FuYXJ5Q29uZmlnJywge1xuICB0cmFmZmljUm91dGluZzogY29kZWRlcGxveS5UcmFmZmljUm91dGluZy50aW1lQmFzZWRDYW5hcnkoe1xuICAgIGludGVydmFsOiBjZGsuRHVyYXRpb24ubWludXRlcygxKSxcbiAgICBwZXJjZW50YWdlOiAyMCxcbiAgfSksXG59KTtcblxuY29uc3QgZGcgPSBuZXcgY29kZWRlcGxveS5FY3NEZXBsb3ltZW50R3JvdXAoc3RhY2ssICdCbHVlR3JlZW5ERycsIHtcbiAgYWxhcm1zOiBbXG4gICAgYmx1ZVVuaGVhbHRoeUhvc3RzLFxuICAgIGJsdWVBcGlGYWlsdXJlLFxuICAgIGdyZWVuVW5oZWFsdGh5SG9zdHMsXG4gICAgZ3JlZW5BcGlGYWlsdXJlLFxuICBdLFxuICBzZXJ2aWNlLFxuICBibHVlR3JlZW5EZXBsb3ltZW50Q29uZmlnOiB7XG4gICAgYmx1ZVRhcmdldEdyb3VwOiBibHVlVEcsXG4gICAgZ3JlZW5UYXJnZXRHcm91cDogZ3JlZW5URyxcbiAgICBsaXN0ZW5lcjogcHJvZExpc3RlbmVyLFxuICAgIHRlc3RMaXN0ZW5lcixcbiAgICB0ZXJtaW5hdGlvbldhaXRUaW1lOiBjZGsuRHVyYXRpb24ubWludXRlcygxKSxcbiAgfSxcbiAgZGVwbG95bWVudENvbmZpZyxcbiAgYXV0b1JvbGxiYWNrOiB7XG4gICAgc3RvcHBlZERlcGxveW1lbnQ6IHRydWUsXG4gIH0sXG59KTtcblxuLy8gT3V0cHV0cyB0byB1c2UgZm9yIG1hbnVhbCB0ZXN0aW5nXG5uZXcgY2RrLkNmbk91dHB1dChzdGFjaywgJ05ld1Rhc2tEZWZpbml0aW9uJywgeyB2YWx1ZTogdGFza0RlZmluaXRpb24yLnRhc2tEZWZpbml0aW9uQXJuIH0pO1xubmV3IGNkay5DZm5PdXRwdXQoc3RhY2ssICdTdWJuZXQxSWQnLCB7IHZhbHVlOiB2cGMucHJpdmF0ZVN1Ym5ldHNbMF0uc3VibmV0SWQgfSk7XG5uZXcgY2RrLkNmbk91dHB1dChzdGFjaywgJ1N1Ym5ldDJJZCcsIHsgdmFsdWU6IHZwYy5wcml2YXRlU3VibmV0c1sxXS5zdWJuZXRJZCB9KTtcbm5ldyBjZGsuQ2ZuT3V0cHV0KHN0YWNrLCAnU2VjdXJpdHlHcm91cElkJywgeyB2YWx1ZTogc2VydmljZS5jb25uZWN0aW9ucy5zZWN1cml0eUdyb3Vwc1swXS5zZWN1cml0eUdyb3VwSWQgfSk7XG5uZXcgY2RrLkNmbk91dHB1dChzdGFjaywgJ0NvZGVEZXBsb3lBcHBsaWNhdGlvbk5hbWUnLCB7IHZhbHVlOiBkZy5hcHBsaWNhdGlvbi5hcHBsaWNhdGlvbk5hbWUgfSk7XG5uZXcgY2RrLkNmbk91dHB1dChzdGFjaywgJ0NvZGVEZXBsb3lEZXBsb3ltZW50R3JvdXBOYW1lJywgeyB2YWx1ZTogZGcuZGVwbG95bWVudEdyb3VwTmFtZSB9KTtcblxubmV3IGludGVnLkludGVnVGVzdChhcHAsICdFY3NEZXBsb3ltZW50R3JvdXBUZXN0Jywge1xuICB0ZXN0Q2FzZXM6IFtzdGFja10sXG59KTtcblxuYXBwLnN5bnRoKCk7XG4iXX0=