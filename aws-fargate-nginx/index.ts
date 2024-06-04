import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const config = new pulumi.Config();
const vpcStack = config.require("vpcStack");
const image = config.require("image");
const desiredCount = config.requireNumber("desiredCount");

const vpcStackRef = new pulumi.StackReference("vpc-stack", {
  name: vpcStack,
});

const vpcId = vpcStackRef.getOutput("vpcId") as pulumi.Output<string>;
const privateSubnetIds = vpcStackRef.getOutput("privateSubnetIds") as pulumi.Output<string[]>;
const albArn = vpcStackRef.getOutput("albArn") as pulumi.Output<string>;
const clusterArn = vpcStackRef.getOutput("ecsClusterArn") as pulumi.Output<string>;

const targetGroup = new aws.lb.TargetGroup("app-tg", {
  port: 80,
  protocol: "HTTP",
  targetType: "ip",
  vpcId: vpcId,
});

new aws.lb.Listener("web", {
  loadBalancerArn: albArn,
  port: 80,
  defaultActions: [{
    type: "forward",
    targetGroupArn: targetGroup.arn,
  }],
});

const role = new aws.iam.Role("task-exec-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2008-10-17",
    Statement: [{
      Action: "sts:AssumeRole",
      Principal: {
        Service: "ecs-tasks.amazonaws.com",
      },
      Effect: "Allow",
      Sid: "",
    }],
  }),
});

new aws.iam.RolePolicyAttachment("task-exec-policy", {
  role: role.name,
  policyArn: aws.iam.ManagedPolicy.AmazonECSTaskExecutionRolePolicy,
});

const appName = "my-app";

const taskDefinition = new aws.ecs.TaskDefinition("app-task", {
  family: "fargate-task-definition",
  cpu: "256",
  memory: "512",
  networkMode: "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  executionRoleArn: role.arn,
  containerDefinitions: JSON.stringify([{
    name: appName,
    image: image,
    portMappings: [{
      containerPort: 80,
      hostPort: 80,
      protocol: "tcp",
    }],
  }]),
});

const vpc = aws.ec2.Vpc.get("app-vpc", vpcId);

const appSecurityGroup = new aws.ec2.SecurityGroup("app-sec-grp", {
  vpcId: vpcId,
  description: "ALB Security Group",
  ingress: [{
    description: "Allow HTTP ingress from inside the VPC",
    protocol: "tcp",
    fromPort: 80,
    toPort: 80,
    cidrBlocks: [vpc.cidrBlock],
  }],
  egress: [{
    description: "Allow all egress",
    protocol: "-1",
    fromPort: 0,
    toPort: 0,
    cidrBlocks: ["0.0.0.0/0"],
  }],
});

new aws.ecs.Service("app-svc", {
  cluster: clusterArn,
  desiredCount: desiredCount,
  launchType: "FARGATE",
  taskDefinition: taskDefinition.arn,
  networkConfiguration: {
    assignPublicIp: false,
    subnets: privateSubnetIds,
    securityGroups: [appSecurityGroup.id],
  },
  loadBalancers: [{
    targetGroupArn: targetGroup.arn,
    containerName: appName,
    containerPort: 80,
  }],
});

const alb = aws.lb.LoadBalancer.get("alb", albArn);

export const url = pulumi.interpolate`http://${alb.dnsName}`;