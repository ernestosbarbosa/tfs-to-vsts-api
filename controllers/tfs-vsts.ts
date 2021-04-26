import { Router, Request, Response } from 'express';
import * as queue from 'express-queue'
import * as cors from 'cors'
import * as bodyParser from 'body-parser'
import { WebApi, getNtlmHandler, getPersonalAccessTokenHandler } from 'azure-devops-node-api';
import { TestSuite, SuiteCreateModel } from 'azure-devops-node-api/interfaces/TestInterfaces';
import { ITestApi } from 'azure-devops-node-api/TestApi';

const router: Router = Router();

router.use(cors());
// router.use(bodyParser.json());
router.use(bodyParser.json({ limit: '50mb' }));
router.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));
router.use(queue({ activeLimit: 1, queuedLimit: -1 }));

router.get('/', (req: Request, res: Response) => {
    res.send('Hello, World!');
});

router.post('/projects', (req: Request, res: Response) => {
    let api: WebApi;
    let baseUrl = req.body.baseUrl;
    let authHandler: any;
    if (req.body.type == "tfs") {
        authHandler = getNtlmHandler(
            req.body.credentials.username,
            req.body.credentials.password,
            req.body.credentials.workstation,
            req.body.credentials.domain
        );
    } else {
        authHandler = getPersonalAccessTokenHandler(req.body.credentials.token);
    }
    api = new WebApi(baseUrl, authHandler, {socketTimeout: 120000, isSsl: true});
    api.getCoreApi(true, baseUrl).then(coreApi => {
        coreApi.getProjects(true).then(projects => {
            res.contentType('application/json').status(200).send(JSON.stringify(projects));
        })
    })
});

router.post('/plans', (req: Request, res: Response) => {
    let api: WebApi;
    let baseUrl = req.body.baseUrl;
    let authHandler: any;
    if (req.body.type == "tfs") {
        authHandler = getNtlmHandler(
            req.body.credentials.username,
            req.body.credentials.password,
            req.body.credentials.workstation,
            req.body.credentials.domain
        );
    } else {
        authHandler = getPersonalAccessTokenHandler(req.body.credentials.token);
    }
    api = new WebApi(baseUrl, authHandler, {socketTimeout: 120000, isSsl: true});
    let project = req.body.project;
    api.getTestApi(req.body.type, baseUrl).then(testApi => {
        testApi.getPlans(project).then(plans => {
            plans = plans.filter(plan => plan.state === "Active");
            res.contentType('application/json').status(200).send(JSON.stringify(plans));
        })
    });
});

router.post('/suites', (req: Request, res: Response) => {
    let api: WebApi;
    let baseUrl = req.body.baseUrl;
    let authHandler: any;
    if (req.body.type == "tfs") {
        authHandler = getNtlmHandler(
            req.body.credentials.username,
            req.body.credentials.password,
            req.body.credentials.workstation,
            req.body.credentials.domain
        );
    } else {
        authHandler = getPersonalAccessTokenHandler(req.body.credentials.token);
    }
    api = new WebApi(baseUrl, authHandler, {socketTimeout: 120000, isSsl: true});
    let project = req.body.project;
    let planId = req.body.planId;
    api.getTestApi(req.body.type, baseUrl).then(testApi => {
        testApi.getTestSuitesForPlan(project, planId).then(suites => {
            let s: TestSuite;
            // for (const suite of suites) {
            suites.forEach(suite => {
                if (!suite.parent) {
                    s = appendChilds(suite, suites);
                }
            })
            res.contentType('application/json').status(200).send(JSON.stringify(s));
        })
    });
});

router.post('/tests', (req: Request, res: Response) => {
    let api: WebApi;
    let baseUrl = req.body.baseUrl;
    let authHandler: any;
    if (req.body.type == "tfs") {
        authHandler = getNtlmHandler(
            req.body.credentials.username,
            req.body.credentials.password,
            req.body.credentials.workstation,
            req.body.credentials.domain
        );
    } else {
        authHandler = getPersonalAccessTokenHandler(req.body.credentials.token);
    }
    api = new WebApi(baseUrl, authHandler, {socketTimeout: 120000, isSsl: true});
    let project = req.body.project;
    let planId = req.body.planId;
    let suiteId = req.body.suiteId;
    setTimeout(()=>{
        api.getTestApi(req.body.type, baseUrl).then(testApi => {
            testApi.getTestCases(project, planId, suiteId).then(tests => {
                getTests(api, tests, req, res, suiteId, planId, baseUrl);
            })
        });
    }, 5000)
});

async function getTests(api, tests, req, res, suiteId, planId, baseUrl) {
    let promises: any[] = [];
    for (const test of tests) {
        // tests.forEach(test => {
        await promises.push(api.getWorkItemTrackingApi(req.body.type, baseUrl).then(witApi => {
            return witApi.getWorkItem(Number.parseInt(test.testCase.id)).then(wit => {
                let testCase: any = test;
                testCase.wit = wit;
                return testCase;
            }).then(testCase => {
                return witApi.getWorkItem(Number.parseInt(suiteId)).then(wit => {
                    testCase.suite = wit;
                    return testCase;
                })
            }).then(testCase => {
                return witApi.getWorkItem(Number.parseInt(planId)).then(wit => {
                    testCase.plan = wit;
                    return testCase;
                })
            })
        }))
    }//)
    Promise.all(promises).then(testArray => {
        res.contentType('application/json').status(200).send(JSON.stringify(testArray));
    })
}

function appendChilds(root: TestSuite, suites: TestSuite[]) {
    let childs = suites.filter(suite => suite.parent && suite.parent.id === `${root.id}`);
    root.children = childs;
    root.children.forEach((child, idx) => {
        root.children[idx] = appendChilds(child, suites);
    })
    return root;
}

router.post('/import', (req: Request, res: Response) => {
    let api: WebApi;
    let baseUrl = req.body.baseUrl;
    let authHandler: any;
    if (req.body.type == "tfs") {
        authHandler = getNtlmHandler(
            req.body.credentials.username,
            req.body.credentials.password,
            req.body.credentials.workstation,
            req.body.credentials.domain
        );
    } else {
        authHandler = getPersonalAccessTokenHandler(req.body.credentials.token);
    }
    api = new WebApi(baseUrl, authHandler, {socketTimeout: 120000, isSsl: true});

    let project = req.body.project;
    let planDest = req.body.plan;
    let plans: any[] = req.body.plans;

    api.getTestApi(req.body.type, baseUrl).then(testApi => {
        api.getWorkItemTrackingApi(req.body.type, baseUrl).then(witApi => {
            return importPlan(api, testApi, witApi, req.body.type, project, planDest, plans);
            // let promises = [];
            // for (const plan of plans) {
            //     promises.push(processPlan(api, testApi, witApi, req.body.type, project, planDest, plan));
            // }
            // Promise.all(promises).then(() => {
            //     res.contentType('application/json').status(200).send();
            // }, err => {
            //     console.log("Erro Planos");
            //     console.log(err);
            // })
        }).then(()=>{
            res.contentType('application/json').status(200).send();
        });
    });

});

async function importPlan(api, testApi, witApi, type, project, planDest, plans) {
    for (const plan of plans) {
        await processPlan(api, testApi, witApi, type, project, planDest, plan);
    }
}

async function processPlan(api, testApi, witApi, type, project, planDest, plan) {
    return await testApi.getPlanById(project, planDest).then(pl => {
        let promises = [];

        /*  Validar uso de arr.reduce() para os loops  */

        createPlan(plan.suites, api, type, testApi, witApi, project, planDest, Number.parseInt(pl.rootSuite.id));
        // // plans.forEach(plan => {
        // plan.suites.forEach(suite => {
        //     let s: SuiteCreateModel = {
        //         name: suite.item.name,
        //         suiteType: "StaticTestSuite",
        //         queryString: null,
        //         requirementIds: null
        //     }
        //     promises.push(createSuite(api, type, testApi, witApi, project, planDest, Number.parseInt(pl.rootSuite.id), s, suite));
        // });

        // return Promise.all(promises).then(res => {
        //     console.log("Plano");
        //     return res;
        // }, err => {
        //     console.log("Erro Suites");
        //     console.log(err);
        // })
    }, err => {
        console.log("Erro PlanById");
        console.log(err);
    })
}

async function createPlan(suites, api, type, testApi, witApi, project, planDest, rootSuiteId) {
    for (const suite of suites) {
        let s: SuiteCreateModel = {
            name: suite.item.name,
            suiteType: "StaticTestSuite",
            queryString: null,
            requirementIds: null
        }
        await createSuite(api, type, testApi, witApi, project, planDest, rootSuiteId, s, suite);
    }
}

async function addSuiteTree(api, type, testApi, witApi, project, planDest, wit, suite) {
    if (suite.children.length > 0) {
        for (const child of suite.children) {
            // suite.children.forEach(async (child) => {
            let s: SuiteCreateModel = {
                name: child.item.name,
                suiteType: "StaticTestSuite",
                queryString: null,
                requirementIds: null
            }
            await createChildSuite(api, type, testApi, witApi, project, planDest, wit[0].id, s, child);
        }//)
    }
    if (suite.tests.length > 0) {
        for (const test of suite.tests) {
            await createTestCase(api, type, testApi, witApi, project, planDest, wit[0].id, test);
        }
    }
}

async function createSuite(api, type, testApi, witApi, project, planDest, parentSuiteId, suiteModel, suite) {
    return await testApi.createTestSuite(suiteModel, project, planDest, parentSuiteId).then(wit => {
        return wit;
    }).then(wit => {
        if (suite.children.length > 0) {
            addSuiteTree(api, type, testApi, witApi, project, planDest, wit, suite);
        }
        if (suite.tests.length > 0) {
            addTestToCreatedSuite(api, type, testApi, witApi, project, planDest, wit, suite);
        }
    }, err => {
        console.log(`Erro CreateTestSuite ${suiteModel.name}`);
        console.log(err);
    })
}

async function createChildSuite(api, type, testApi, witApi, project, planDest, id, s, child) {
    return await createSuite(api, type, testApi, witApi, project, planDest, id, s, child).then(suite => {
        console.log(suite);
        return suite;
    });
}

async function addTestToCreatedSuite(api, type, testApi, witApi, project, planDest, wit, suite) {
    for (const test of suite.tests) {
        await createTestCase(api, type, testApi, witApi, project, planDest, wit[0].id, test);
    }
}

async function createTestCase(api: WebApi, type, testApi: ITestApi, witApi, project, planDest, suiteId, test) {
    let witType = "Test Case";
    let witDoc = [];
    if (test.wit.fields['System.Title']) {
        witDoc.push(
            {
                "op": "add",
                "path": "/fields/System.Title",
                "from": null,
                "value": test.wit.fields['System.Title']
            }
        );
    }
    if (test.wit.fields['System.Description']) {
        witDoc.push(
            {
                "op": "add",
                "path": "/fields/System.Description",
                "from": null,
                "value": test.wit.fields['System.Description']
            }
        );
    }
    if (test.wit.fields['Microsoft.VSTS.TCM.Steps']) {
        witDoc.push(
            {
                "op": "add",
                "path": "/fields/Microsoft.VSTS.TCM.Steps",
                "from": null,
                "value": test.wit.fields['Microsoft.VSTS.TCM.Steps']
            }
        );
    }
    return createWit(testApi, witApi, witDoc, project, witType, planDest, suiteId).then(wit => {
        console.log(`Teste ${test.wit.fields['System.Title']}`);
        return wit;
    });
}

async function createWit(testApi, witApi, witDoc, project, witType, planDest, suiteId) {
    return await witApi.createWorkItem(null, witDoc, project, witType).then(wit => {
        return wit;
    }).then(wit => {
        console.log(`Wit ${wit.id}`);
        return addTestToSuite(testApi, project, planDest, suiteId, `${wit.id}`).then(res => {
            return res;
        });
    }, err => {
        console.log("Erro Wit");
        console.log(err);
    })
}

async function addTestToSuite(testApi, project, planDest, suiteId, id) {
    return await testApi.addTestCasesToSuite(project, planDest, suiteId, id).then(res => {
        console.log("addTestToSuite");
        console.log(res);
        return res;
    }, err => {
        console.log("Erro addTestToSuite");
        console.log(err);
    })
}

export const TfsVstsController: Router = router;