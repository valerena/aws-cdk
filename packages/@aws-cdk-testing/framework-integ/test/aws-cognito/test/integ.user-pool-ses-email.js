"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const aws_cdk_lib_1 = require("aws-cdk-lib");
const integ_tests_alpha_1 = require("@aws-cdk/integ-tests-alpha");
const aws_cognito_1 = require("aws-cdk-lib/aws-cognito");
const app = new aws_cdk_lib_1.App();
const stack = new aws_cdk_lib_1.Stack(app, 'integ-user-ses-email');
const userpool = new aws_cognito_1.UserPool(stack, 'myuserpool', {
    removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
    userPoolName: 'MyUserPool',
    email: aws_cognito_1.UserPoolEmail.withSES({
        sesRegion: 'us-east-1',
        fromEmail: 'noreply@example.com',
        fromName: 'myname@mycompany.com',
        replyTo: 'support@example.com',
        sesVerifiedDomain: 'example.com',
    }),
});
new aws_cdk_lib_1.CfnOutput(stack, 'user-pool-id', {
    value: userpool.userPoolId,
});
new integ_tests_alpha_1.IntegTest(app, 'IntegTest', { testCases: [stack] });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZWcudXNlci1wb29sLXNlcy1lbWFpbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImludGVnLnVzZXItcG9vbC1zZXMtZW1haWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSw2Q0FBbUU7QUFDbkUsa0VBQXVEO0FBQ3ZELHlEQUFrRTtBQUVsRSxNQUFNLEdBQUcsR0FBRyxJQUFJLGlCQUFHLEVBQUUsQ0FBQztBQUN0QixNQUFNLEtBQUssR0FBRyxJQUFJLG1CQUFLLENBQUMsR0FBRyxFQUFFLHNCQUFzQixDQUFDLENBQUM7QUFFckQsTUFBTSxRQUFRLEdBQUcsSUFBSSxzQkFBUSxDQUFDLEtBQUssRUFBRSxZQUFZLEVBQUU7SUFDakQsYUFBYSxFQUFFLDJCQUFhLENBQUMsT0FBTztJQUNwQyxZQUFZLEVBQUUsWUFBWTtJQUMxQixLQUFLLEVBQUUsMkJBQWEsQ0FBQyxPQUFPLENBQUM7UUFDM0IsU0FBUyxFQUFFLFdBQVc7UUFDdEIsU0FBUyxFQUFFLHFCQUFxQjtRQUNoQyxRQUFRLEVBQUUsc0JBQXNCO1FBQ2hDLE9BQU8sRUFBRSxxQkFBcUI7UUFDOUIsaUJBQWlCLEVBQUUsYUFBYTtLQUNqQyxDQUFDO0NBQ0gsQ0FBQyxDQUFDO0FBRUgsSUFBSSx1QkFBUyxDQUFDLEtBQUssRUFBRSxjQUFjLEVBQUU7SUFDbkMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxVQUFVO0NBQzNCLENBQUMsQ0FBQztBQUVILElBQUksNkJBQVMsQ0FBQyxHQUFHLEVBQUUsV0FBVyxFQUFFLEVBQUUsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBDZm5PdXRwdXQsIFJlbW92YWxQb2xpY3ksIFN0YWNrIH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgSW50ZWdUZXN0IH0gZnJvbSAnQGF3cy1jZGsvaW50ZWctdGVzdHMtYWxwaGEnO1xuaW1wb3J0IHsgVXNlclBvb2wsIFVzZXJQb29sRW1haWwgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5cbmNvbnN0IGFwcCA9IG5ldyBBcHAoKTtcbmNvbnN0IHN0YWNrID0gbmV3IFN0YWNrKGFwcCwgJ2ludGVnLXVzZXItc2VzLWVtYWlsJyk7XG5cbmNvbnN0IHVzZXJwb29sID0gbmV3IFVzZXJQb29sKHN0YWNrLCAnbXl1c2VycG9vbCcsIHtcbiAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICB1c2VyUG9vbE5hbWU6ICdNeVVzZXJQb29sJyxcbiAgZW1haWw6IFVzZXJQb29sRW1haWwud2l0aFNFUyh7XG4gICAgc2VzUmVnaW9uOiAndXMtZWFzdC0xJyxcbiAgICBmcm9tRW1haWw6ICdub3JlcGx5QGV4YW1wbGUuY29tJyxcbiAgICBmcm9tTmFtZTogJ215bmFtZUBteWNvbXBhbnkuY29tJyxcbiAgICByZXBseVRvOiAnc3VwcG9ydEBleGFtcGxlLmNvbScsXG4gICAgc2VzVmVyaWZpZWREb21haW46ICdleGFtcGxlLmNvbScsXG4gIH0pLFxufSk7XG5cbm5ldyBDZm5PdXRwdXQoc3RhY2ssICd1c2VyLXBvb2wtaWQnLCB7XG4gIHZhbHVlOiB1c2VycG9vbC51c2VyUG9vbElkLFxufSk7XG5cbm5ldyBJbnRlZ1Rlc3QoYXBwLCAnSW50ZWdUZXN0JywgeyB0ZXN0Q2FzZXM6IFtzdGFja10gfSk7XG4iXX0=