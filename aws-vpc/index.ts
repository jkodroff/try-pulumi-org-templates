import * as awsx from "@pulumi/awsx";
import * as aws from "@pulumi/aws";

const vpc = new awsx.ec2.Vpc("pulumi-org-templates", {
  natGateways: {
    strategy: "Single"
  }
});

const cluster = new aws.ecs.Cluster("cluster");

const albSecurityGroup = new aws.ec2.SecurityGroup("alb-secgrp", {
  vpcId: vpc.vpcId,
  description: "ALB Security Group",
  ingress: [{
    description: "Allow HTTP ingress from anywhere",
    protocol: "tcp",
    fromPort: 80,
    toPort: 80,
    cidrBlocks: ["0.0.0.0/0"],
  }, {
    description: "Allow HTTPS ingress from anywhere",
    protocol: "tcp",
    fromPort: 443,
    toPort: 443,
    cidrBlocks: ["0.0.0.0/0"],
  }],
  egress: [{
    description: "Allow HTTP egress to anywhere in the VPC",
    protocol: "tcp",
    fromPort: 80,
    toPort: 80,
    cidrBlocks: [vpc.vpc.cidrBlock],
  }],
});

const alb = new aws.lb.LoadBalancer("app-lb", {
  securityGroups: [albSecurityGroup.id],
  subnets: vpc.publicSubnetIds,
});

export const vpcId = vpc.vpcId;
export const publicSubnetIds = vpc.publicSubnetIds;
export const privateSubnetIds = vpc.privateSubnetIds;

export const albArn = alb.arn;

export const ecsClusterArn = cluster.arn;
