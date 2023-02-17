const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const twit = require('twit')
const { ETwitterStreamEvent, TweetStream, TwitterApi, ETwitterApiError, auth} =require('twitter-api-v2');
const axios  = require('axios')
const { response, json } = require('express')

const app = express()

app.use(cors())

app.use(bodyParser.urlencoded({
    extended: true
  }));

app.use(express.json());


const port = process.env.PORT || 3000

// const twitterApi = new twitter({
//     consumer_key : "K0xNtDv7VouUC294pBRPgAHdr" ,
//     consumer_secret : "2aTC67swxHKP64SBCQBnnsfGKR5Ec0iWKoGR3eCV5V1thsoMsR",
//     access_token : "620757286-BPZuCXML1SXbmyECresO1cqs7dDgmOBnB6PngoQO",
//     access_token_secret : "kDaeOIFzfYDfBfetHad9TJgP2h2A0LZIjCkRMxuXTuf1P",
//     timeout_ms : 60 * 1000
// })

const client = new TwitterApi('AAAAAAAAAAAAAAAAAAAAAFz6hAEAAAAARD6nNnZn96aDoOuSD8i4%2F2MboVI%3DBOBLcdjiMcw1Vufj94s0oPWGiA2TNdmDCzMgFp7sLjpi8Fz1hK');
    

var stream
let userList = {}
let subscribersList = {}
let ruleMap = {}
var streamIsConnectedStatus = ""
var errorStream
var isAllowedTweet = true
var timerOf15Minute

function fetchTwitterPublishers(){
    axios.get('https://us-central1-quickreach-aed40.cloudfunctions.net/restApis/getTwitterPublishersData').then((response)=>{
       userList = JSON.parse(JSON.stringify(response.data))
    })  
}

function fetchTwitterSubscribers(){
    axios.get('https://us-central1-quickreach-aed40.cloudfunctions.net/restApis/getTwitterSubscribersData').then((response)=>{
       subscribersList = JSON.parse(JSON.stringify(response.data))
    })  
}



  async function addInRuleMap(Id){

    var length = Object.keys(ruleMap).length
    var isIncluded = false;
    
    
    Object.keys(ruleMap).forEach((key)=>{
        var ruleList = ruleMap[key];
          
            if(ruleList.includes(Id)){
                isIncluded = true
            }
    })
    
    if(!isIncluded){
        var rule = "rule" + length;
        
        if(ruleMap[rule].length + ("-is:retweet from:" + Id).length > 512){
            //console.log("iffff") 
            length = length + 1
             var newRule = "rule" + length
             ruleMap[newRule] = "-is:retweet from:" + Id
             const addedRules = await client.v2.updateStreamRules({
                add: [
                  {value: ruleMap[newRule]},
                  ],
              });
              
        }
        else{
            const rules = await client.v2.streamRules()

            var ruleIds = []
            rules.data.forEach((ele)=>{
                if(ele.value.includes(ruleMap[rule]))
              { 
                ruleIds.push(ele.id)
              }
            })
            const deleteRules = await client.v2.updateStreamRules({
                delete: {
                ids: ruleIds,
                },
            });

            ruleMap[rule] = ruleMap[rule] + " OR " + "-is:retweet from:" + Id;

            const addedRules = await client.v2.updateStreamRules({
                add: [
                {value: ruleMap[rule] },
                ],
            });
            console.log("rule updated else")
        }

    }
    
   }
  
   

 async function removeInRuleMap(Id){
    var isIncluded = false;
    var rule;
    Object.keys(ruleMap).forEach((key)=>{
        var ruleList = ruleMap[key];
          
            if(ruleList.includes(Id)){
                isIncluded = true
                rule = key
            }
    })
    
    if(isIncluded){
        var ruleList = ruleMap[rule]
        
        const rules = await client.v2.streamRules()

            var ruleIds = []
            rules.data.forEach((rule)=>{
              if(rule.value.includes(ruleList))
              {
                ruleIds.push(rule.id)
              }
            })
            const deleteRules = await client.v2.updateStreamRules({
                delete: {
                ids: ruleIds,
                },
            });
            console.log()
         
        if(ruleList.includes("-is:retweet from:" + Id + " OR ")){
            ruleList = ruleList.replace("-is:retweet from:" + Id + " OR ", "");
          }
          else{
            ruleList = ruleList.replace(" OR -is:retweet from:" + Id, "");
          }
          ruleList = ruleList.trim()
          ruleMap[rule] = ruleList
          const addedRules = await client.v2.updateStreamRules({
            add: [
            {value: ruleList },
            ],
        });
    }
    
}

function set15minTimerOut(){
    isAllowedTweet = false
    timerOf15Minute = setTimeout(()=>{
            isAllowedTweet = true
            clearTimeout(timerOf15Minute)
    }, 960000 )
   
}

function doAllRetweets(subscribers, tweet){

    //console.log("do all retweetssssssssssssss")
    //console.log(subscribers)
    subscribers.forEach(async(element, key) => {
        //console.log("loooopppppppppp")  
     if(subscribersList[element.twitterId].isAllowedAutomaticRetweets){   
        
        if(subscribersList[element.twitterId].isLoginByURL){
            var retweetCred = new twit({
                consumer_key : "n58AlgPKH47GIWrmR3eH4vE8z" ,
                consumer_secret : "vomHhRkABsllgCPRuuqYw6DB5l3pjkBmTRIlAhpE09Mp7ktOSt",
                access_token : subscribersList[element.twitterId].accessToken,
                access_token_secret : subscribersList[element.twitterId].accessTokenSecret,
                timeout_ms : 60 * 500
            })
            
            retweetCred.post("statuses/retweet/:id",{
                id: tweet.data.id
                },
            
                (err, data, res)=>{
                    if(data.errors!=undefined){
                    subscribersList[element.twitterId].retweetsDoneCount = subscribersList[element.twitterId].retweetsDoneCount + 1
                    axios.post('https://us-central1-quickreach-aed40.cloudfunctions.net/restApis/updateSubscriberReTweetCount', {
                            "twitterId" : element.twitterId ,
                            "count": subscribersList[element.twitterId].retweetsDoneCount
                 })
                }
                }
            )
            
            retweetCred.post("favorites/create",{
                id: tweet.data.id
                },
            
                (err, data, res)=>{
                    console.log("Liked");
                }
            )

        }
        else{
        
            const retweetClient = new TwitterApi({
            appKey: 'mApGFPhR3WqsFQoVMt6aVirHf',
            appSecret: 'YZQ2cLatHcSekfVB6xQWpOnwCAaJWUkhz3aPbuNgyKBeRm8rqP',
            accessToken:  subscribersList[element.twitterId].accessToken,
            accessSecret: subscribersList[element.twitterId].accessTokenSecret,
          });
          
          var createRetweet
      try{  
        createRetweet = await retweetClient.v2.retweet(element.twitterId, tweet.data.id)
        if(createRetweet.data.retweeted){
            subscribersList[element.twitterId].retweetsDoneCount = subscribersList[element.twitterId].retweetsDoneCount + 1
                axios.post('https://us-central1-quickreach-aed40.cloudfunctions.net/restApis/updateSubscriberReTweetCount', {
                            "twitterId" : element.twitterId ,
                            "count": subscribersList[element.twitterId].retweetsDoneCount
                })    
        }
    }
    catch(e){
        // console.log("problem in retweet do check")
        // console.log(e)
        // console.log(e.code)
        if(e.code == 429 && isAllowedTweet){
            //console.log("setting time out do all")
         set15minTimerOut()   
        }

    }
        const createLike = await retweetClient.v2.like(element.twitterId, tweet.data.id)
        
        
    }
   }
    });
}

function doCheckedRetweets(subscribers, tweet){
    //console.log(tweet.data.id)
    //console.log("do check retweets")
    //console.log(subscribers)
    
    subscribers.forEach(async(element, key) => {
       //console.log("inside----------------------------")
      if((subscribersList[element.twitterId].isPaidForDoingRetweet || subscribersList[element.twitterId].retweetsDoneCount<1000000)
         && subscribersList[element.twitterId].isAllowedAutomaticRetweets){
         
            //console.log("eddddddddddddddddddddddddddddddd")
            if(subscribersList[element.twitterId].isLoginByURL){
                var retweetCred = new twit({
                    consumer_key : "n58AlgPKH47GIWrmR3eH4vE8z" ,
                    consumer_secret : "vomHhRkABsllgCPRuuqYw6DB5l3pjkBmTRIlAhpE09Mp7ktOSt",
                    access_token : subscribersList[element.twitterId].accessToken,
                    access_token_secret : subscribersList[element.twitterId].accessTokenSecret,
                    timeout_ms : 60 * 500
                })
                
                retweetCred.post("statuses/retweet/:id",{
                    id: tweet.data.id
                    },
                
                    (err, data, res)=>{
                        if(data.errors!=undefined){
                        subscribersList[element.twitterId].retweetsDoneCount = subscribersList[element.twitterId].retweetsDoneCount + 1
                        axios.post('https://us-central1-quickreach-aed40.cloudfunctions.net/restApis/updateSubscriberReTweetCount', {
                                "twitterId" : element.twitterId ,
                                "count": subscribersList[element.twitterId].retweetsDoneCount
                     })
                    }
                    }
                )
                
                retweetCred.post("favorites/create",{
                    id: tweet.data.id
                    },
                
                    (err, data, res)=>{
                        console.log("Liked");
                    }
                )
    
            }
            else{
            const retweetClient = new TwitterApi({
                appKey: 'mApGFPhR3WqsFQoVMt6aVirHf',
                appSecret: 'YZQ2cLatHcSekfVB6xQWpOnwCAaJWUkhz3aPbuNgyKBeRm8rqP',
                accessToken: subscribersList[element.twitterId].accessToken,
                accessSecret: subscribersList[element.twitterId].accessTokenSecret,
              });
        //const retweetClient = new TwitterApi('VmhScjVzQTJ5QXNvZUVZMGZkSDR0dl9wNTg5NTB6dThfeTU4QmQzeUJQUmtqOjE2NjYwMDY5ODA3OTA6MToxOmF0OjE');
        //console.log("confirmmmmmm")
        var createRetweet
        try{
         createRetweet = await retweetClient.v2.retweet(element.twitterId, tweet.data.id)
         if(createRetweet.data.retweeted){
            subscribersList[element.twitterId].retweetsDoneCount = subscribersList[element.twitterId].retweetsDoneCount + 1 
                axios.post('https://us-central1-quickreach-aed40.cloudfunctions.net/restApis/updateSubscriberReTweetCount', {
                            "twitterId" : element.twitterId ,
                            "count": subscribersList[element.twitterId].retweetsDoneCount
                })
        }
        }
        catch(e){
            // console.log("problem in retweet do check")
            // console.log(e)
            // console.log(e.code)
            if(e.code == 429 && isAllowedTweet){
                //console.log("setting time out do check")
                set15minTimerOut()   
               }
        }
        const createLike = await retweetClient.v2.like(element.twitterId, tweet.data.id)
        //console.log(createRetweet.data.retweeted)
        
       }
      }
      });
}






function attachStreamOnPublisherData(){
    axios.get('https://us-central1-quickreach-aed40.cloudfunctions.net/restApis/getRulesMap').then(async (response)=>{
    ruleMap = response.data
    
    if(ruleMap==={})
        ruleMap = {"rule1" : "1"}
        
        console.log(ruleMap)  
        
        stream = client.v2.searchStream({ autoConnect: false, "tweet.fields": [
            "author_id"
        ], });
        
        let addList = []
        
        Object.keys(ruleMap).forEach((key)=>{
         if(key=="rule1" || key=="rule2" || key=="rule3"
         ||key=="rule4" || key=="rule5")  
         addList.push({"value" : ruleMap[key]})
        })
        
        try{
        const rules = await client.v2.streamRules()
        
        if(rules.data!= undefined)
        {
        var ruleIds = rules.data.map(rule => rule.id);
        
        const deleteRules = await client.v2.updateStreamRules({
            delete: {
            ids: ruleIds,
            },
        });
        }
        }
        catch(e){
            console.log(e)
        } 
        const addedRules = await client.v2.updateStreamRules({
            add: addList,
          });

        //   const rules = await client.v2.streamRules()

        //   var ruleIds = rules.data;
        //   const deleteRules = await client.v2.updateStreamRules({
        //     delete: {
        //       ids: ['1578672423334858753'],
        //     },
        //   });
    
        //   console.log(ruleIds)
        
        stream.on(ETwitterStreamEvent.Data, (tweet)=>{
          console.log("tweet captured") 
          console.log(userList[tweet.data.author_id].subscriberIds)
          userList[tweet.data.author_id].TweetsCapturedCount = userList[tweet.data.author_id].TweetsCapturedCount + 1 
          let subscribers = new Map(Object.entries(userList[tweet.data.author_id].subscriberIds))
          axios.post('https://us-central1-quickreach-aed40.cloudfunctions.net/restApis/updatePublisherTweetCount', {
            "twitterId": tweet.data.author_id,
            "count": userList[tweet.data.author_id].TweetsCapturedCount
          })
          
          var count = -1;
          var localUserList = [];
          var timer = setInterval(()=>{
          if(isAllowedTweet){

            count++;
            var totalUserLength
            
            if(count == 0){
               localUserList = Array.from(subscribers.keys())
               totalUserLength = localUserList.length
               
            }else{
               totalUserLength = localUserList.length
            }
            let passMap = new Map();
            // console.log("lengthhhh")
            // console.log(totalUserLength)
            if(totalUserLength>2){
                //console.log("subscribers5555555555555--------")
                //console.log(subscribers)
                for(var i =0; i<2;i++){
                 passMap[localUserList[i]] = subscribers.get(localUserList[i]);
                }
                //console.log("passMap 5555555555555555555");
                //console.log(passMap)
                passMap = new Map(Object.entries(passMap))
                //console.log("passMap 5555555555555555555555");
                //console.log(passMap)
                        
                if(userList[tweet.data.author_id].isAuthenticated){
                  //console.log("if")
                  if((userList[tweet.data.author_id].isPaidToIncreaseReach || userList[tweet.data.author_id].TweetsCapturedCount<=1000000)
                      && userList[tweet.data.author_id].isAllowedToIncreaseReachRetweets){
                        //console.log("allllllllllllll 555555555")
                        doAllRetweets(passMap, tweet)
                  }
                }
                else{
                  // console.log("else")
                  // console.log("condnnnnnnnnnnnnnnn 555555555")
                   doCheckedRetweets(passMap, tweet)
                }
                 localUserList = localUserList.splice(2, totalUserLength)
                //console.log(localUserList)
            
            }else{
                //console.log("subscribers22222222222222222--------")
                //console.log(subscribers)
                
                for(var i =0; i<localUserList.length;i++){
                    passMap[localUserList[i]] = subscribers.get(localUserList[i]);
                   }
                   //console.log("passMap 22222222222222222222");
                //console.log(passMap)
                
                   passMap = new Map(Object.entries(passMap))
                   //console.log("passMap afterrrrrrrrrrrrrrrrr");
                //console.log(passMap)
                     
              if(userList[tweet.data.author_id].isAuthenticated){
                console.log("if")
                if((userList[tweet.data.author_id].isPaidToIncreaseReach || userList[tweet.data.author_id].TweetsCapturedCount<=1000000)
                    && userList[tweet.data.author_id].isAllowedToIncreaseReachRetweets){
                        //console.log("allllllllllllll 2222222222222222")
                        doAllRetweets(passMap, tweet)
                }
              }
              else{
                // console.log("else")
                // console.log("condnnnnnnnnnnnnnnn 22222222222")       
                 doCheckedRetweets(passMap, tweet)
              }
                localUserList = []
                clearInterval(timer)
            }

          }
        }, 180000)


          
         })  
        
        stream.on(ETwitterStreamEvent.Error, async (error)=> {
            //console.log("Error in Stream")
            streamIsConnectedStatus = "error in Stream"
            errorStream = error
             console.log(error)
            // await stream.close()
            // await stream.reconnect()
            //attachStreamOnPublisherData()
        });

        stream.on(ETwitterStreamEvent.ConnectionLost, (disconnectmsg)=>{
           console.log("disconnect in Stream")
           streamIsConnectedStatus = "disconnect in Stream"
           attachStreamOnPublisherData()
        })

        stream.on(ETwitterStreamEvent.ConnectionClosed, (disconnectmsg)=>{
            console.log("Stream is closed")
            streamIsConnectedStatus = "Stream is closed"
         })
    
        
        stream.on(ETwitterStreamEvent.Connected, () => {
            console.log('Stream is started.')
            streamIsConnectedStatus = "stream Is started"
        });

        await stream.connect({ autoReconnect: true, autoReconnectRetries: Infinity });
    })   
}


app.get("/", (req, res)=>{
    res.status(200).send("Hello From QuickReach");
})

app.post("/onSubscriberAddInPublisher", (req, res)=>{
    console.log("User Deleted")
    
    const twitterPublisherId = req.body["twitterId"];
    const twitterSubscriberId = req.body["subscriberId"];
    // const accessToken =  req.body["accessToken"];
    // const accessTokenSecret = req.body["accessTokenSecret"];
    if(userList[twitterPublisherId].subscriberIds == undefined){
        userList[twitterPublisherId].subscriberIds = {}
    }
    userList[twitterPublisherId].subscriberIds[twitterSubscriberId] = {
      "twitterId" : twitterSubscriberId
    }
    
    addInRuleMap(twitterPublisherId)
    res.status(200).send("User Deleted");
})


app.post("/onSubscriberDeleteInPublisher", (req, res)=>{
    console.log("onSubscriberDeleteInPublisher")
    
    const twitterPublisherId = req.body["twitterId"];
    const twitterSubscriberId = req.body["subscriberId"];

    delete userList[twitterPublisherId].subscriberIds[twitterSubscriberId]

    if(userList[twitterPublisherId].subscriberIds[twitterSubscriberId] == undefined){
        removeInRuleMap(twitterPublisherId)
    }
    else if( Object.keys(userList[twitterPublisherId].subscriberIds[twitterSubscriberId]).length==0){
        removeInRuleMap(twitterPublisherId)
    }
    res.status(200).send("onSubscriberDeleteInPublisher");
})

app.post("/onSubscriberAdd", (req, res)=>{
    console.log("subscriber added")
    
    const twitterSubscriberId = req.body["twitterId"];
    
    subscribersList[twitterSubscriberId] = req.body
    
    res.status(200).send("subscriber added");
})

app.post("/onPublisherAdd", (req, res)=>{
    console.log("subscriber added")
    
    const twitterPublisherId = req.body["twitterId"];
    
    userList[twitterPublisherId] = req.body
    
    res.status(200).send("publisher added");
})


app.post("/onPaymentChangeInPublisher", (req, res)=>{
    console.log("onPaymentChangeInPublisher")
    
    const twitterPublisherId = req.body["twitterId"]
    const planPurchaseDate = req.body["planPurchaseDate"];
    const isPaidToIncreaseReach = req.body["isPaidToIncreaseReach"];
    const typeOfPlanPurchased = req.body["typeOfPlanPurchased"];

    userList[twitterPublisherId].planPurchaseDate = planPurchaseDate
    userList[twitterPublisherId].isPaidToIncreaseReach = isPaidToIncreaseReach
    userList[twitterPublisherId].typeOfPlanPurchased = typeOfPlanPurchased
    
    if(!isPaidToIncreaseReach){
        removeInRuleMap(twitterPublisherId)    
    }
    else{
        addInRuleMap(twitterPublisherId)
    }
    res.status(200).send("onPaymentChangeInPublisher");
})

app.post("/onPaymentChangeInSubscriber", (req, res)=>{
    const twitterSubscriberId = req.body["twitterId"]
    const planPurchaseDate = req.body["planPurchaseDate"];
    const isPaidForDoingRetweet = req.body["isPaidForDoingRetweet"];
    const typeOfPlanPurchased = req.body["typeOfPlanPurchased"];

    subscribersList[twitterSubscriberId].planPurchaseDate = planPurchaseDate
    subscribersList[twitterSubscriberId].isPaidForDoingRetweet = isPaidForDoingRetweet
    subscribersList[twitterSubscriberId].typeOfPlanPurchased = typeOfPlanPurchased
    
    res.status(200).send("onPaymentChangeInSubscriber");
})

app.post("/onIsAllowedToIncreaseReachChangeInPublisher", (req, res)=>{
    
    const twitterPublisherId = req.body["twitterId"]
    const IsAllowedToIncreaseReach = req.body["isAllowedToIncreaseReachRetweets"]

    userList[twitterPublisherId].isAllowedToIncreaseReachRetweets = IsAllowedToIncreaseReach
    if(!IsAllowedToIncreaseReach){
        removeInRuleMap(twitterPublisherId)
    }
    else{
        addInRuleMap(twitterPublisherId)
    }

    res.status(200).send("onIsAllowedToIncreaseReachChangeInPublisher");
})

app.post("/onIsAllowedAutoRetweetsChangeInSubscriber", (req, res)=>{
    const twitterSubscriberId = req.body["twitterId"]
    const IsAllowedAutoRetweets = req.body["isAllowedAutomaticRetweets"];

    subscribersList[twitterSubscriberId].isAllowedAutomaticRetweets = IsAllowedAutoRetweets
    res.status(200).send("onIsAllowedAutoRetweetsChangeInSubscriber");
})

app.get("/testPublisherList", (req, res)=>{
    console.log("publisher List")
    console.log(userList)
    res.status(200).send(userList);
})

app.get("/testSubscriberList", (req, res)=>{
    console.log("Subscriber List")
    console.log(subscribersList)
    res.status(200).send(subscribersList);
})

app.get("/getRuleMap", (req, res)=>{
    console.log(ruleMap)
    res.status(200).send(ruleMap);
})

app.get("/getStreamRules", async(req, res)=>{
    const rules = await client.v2.streamRules()
  
    res.status(200).send(rules);
})

app.get("/getVersion", async(req, res)=>{
  
    res.status(200).send("version-6");
})

app.get("/getErrorAny", async(req, res)=>{
  
    res.status(200).send(errorStream);
})

app.get("/attachStreamConnection", async(req, res)=>{
    attachStreamOnPublisherData();
    res.status(200).send("startStreamConnection");
})

app.get("/connectStreamConnection", async(req, res)=>{
    stream.connect({ autoReconnect: true, autoReconnectRetries: 10 })
    res.status(200).send("connectStreamConnection");
})

app.get("/closeStreamConnection", async(req, res)=>{
    stream.close()
    res.status(200).send("stream is closed");
})

app.get("/reconnectStreamConnection", async(req, res)=>{
    stream.reconnect()
    res.status(200).send("stream is reconnected");
})

app.get("/destroyStreamConnection", async(req, res)=>{
    stream.destroy()
    res.status(200).send("stream is destroyed");
})

app.get("/statusStreamConnection", async(req, res)=>{
    res.status(200).send(streamIsConnectedStatus);
})
app.get("/getAllowTweetStatus", async(req, res)=>{
  res.status(200).send(isAllowedTweet);
})

app.get("/restartFetching", async(req, res)=>{
    fetchTwitterPublishers()
    fetchTwitterSubscribers()
    res.status(200).send("restart fetching");
})

app.listen(port , (req, res)=>{
    fetchTwitterPublishers()
    fetchTwitterSubscribers()
    attachStreamOnPublisherData()
    console.log("Server started and running on port 3000")
})
