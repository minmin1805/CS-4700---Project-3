const dgram = require("dgram");

let portsMap = new Map();
let relationshipMap = new Map();
let socketMap = new Map();
let asnNumber;

const announcementStorage = [];

function sendAnnouncementHelper(neighborIp, storedAnnouncement) {
    //update the ASPath by put the asnNumber at the front of the ASPath
    const updatedASPath = [];
    updatedASPath.push(asnNumber);
    for(let i = 0; i < storedAnnouncement.ASPath.length; i++) {
        updatedASPath.push(storedAnnouncement.ASPath[i]);
    }
    //create the message object to send
    const messageObject = {
        network: storedAnnouncement.network,
        netmask: storedAnnouncement.netmask,
        ASPath: updatedASPath,
    }
    
    const objectToSend = {
        src: srcConvertedHelper(neighborIp),
        dst: neighborIp,
        type: "update",
        msg: messageObject,
    }
    const infoToSend = JSON.stringify(objectToSend);
    socketMap.get(neighborIp).send(infoToSend, portsMap.get(neighborIp), "127.0.0.1");
}

function handleUpdateHelper(neighborIp, receivedInfo) {

    // store the announcement into the announcementStorage
    const storedAnnouncement = {
        network: receivedInfo.msg.network,
        netmask: receivedInfo.msg.netmask,
        localpref: receivedInfo.msg.localpref,
        selfOrigin: receivedInfo.msg.selfOrigin,
        ASPath: receivedInfo.msg.ASPath,
        origin: receivedInfo.msg.origin,
        peer: neighborIp
    }
    announcementStorage.push(storedAnnouncement);

    // determine which neighbor to send the announcement to
    // if the announce is from customer then tell all neighbor, if peer or provider then only tell the customer

    const typeOfAnnouncement = relationshipMap.get(neighborIp);
    //if is customer 
    if(typeOfAnnouncement === "cust") {
        // tell all neighbor

        for(const [anotherNeighbor, relationship] of relationshipMap.entries()) {
            if(anotherNeighbor !== neighborIp) {
                sendAnnouncementHelper(anotherNeighbor, storedAnnouncement);
            }
        }
    }
    else if(typeOfAnnouncement === "peer" || typeOfAnnouncement === "prov") {
        // tell the customer
        for(const [anotherNeighbor, relationship] of relationshipMap.entries()) {
            if(anotherNeighbor !== neighborIp && relationship === "cust") {
                sendAnnouncementHelper(anotherNeighbor, storedAnnouncement);
            }
        }
    }
}

function connectNeighborsHelper(neighborsInfo) {
    for(let i = 0; i < neighborsInfo.length; i++) {

        // save each neighbor'info into the corresponding map
        const splitByHyphen = neighborsInfo[i].split("-");
        const neighborIp = splitByHyphen[1];
        const neighborPort = Number(splitByHyphen[0]);
        const neighborRelationship = splitByHyphen[2];

        portsMap.set(neighborIp, neighborPort);
        relationshipMap.set(neighborIp, neighborRelationship);
        socketMap.set(neighborIp, null);
    }

    //create a socket for each neighbor 
    for(const [neighborIp] of socketMap.entries()) {

        const hostIp = "127.0.0.1";

        const createdSocket = dgram.createSocket("udp4");
        socketMap.set(neighborIp, createdSocket);

        //make socket listen to the neighbor
        createdSocket.on("message", (msg) => {
            const receivedInfo = JSON.parse(msg.toString());

            // determine which operation the neighbor wants to perform
            const type = receivedInfo.type;
            if(type === "update") {
                handleUpdateHelper(neighborIp, receivedInfo);
            } else if(type === "withdraw") {
                handleWithdrawHelper(neighborIp, receivedInfo);
            } else if(type === "data") {
                handleDataHelper(neighborIp, receivedInfo);
            } else if(type === "dump") {
                handleDumpHelper(neighborIp, receivedInfo);
            }
        });

        // bind to port 0
        createdSocket.bind(0, hostIp, function() {
            sendHandshakeHelper(neighborIp);
        });
    }
}

//the same ip number but the last number change from 2 to 1
function srcConvertedHelper(neighborIp) {
    const ipArray = neighborIp.split(".");
    ipArray[3] = "1";
    return ipArray.join(".");
}

function sendHandshakeHelper(neighborIp) {
    const srcConverted = srcConvertedHelper(neighborIp);
    const objectToSend = {
        src: srcConverted,
        dst: neighborIp,
        type: "handshake",
        msg: {},
    };
    const infoToSend = JSON.stringify(objectToSend);
    socketMap.get(neighborIp).send(infoToSend, portsMap.get(neighborIp), "127.0.0.1");
}

function getParamsHelper() {
    const gotParams = process.argv.slice(2);

    asnNumber = Number(gotParams[0]);

    const neighborsInfo = [];

    for(let i = 1; i < gotParams.length; i++) {
        neighborsInfo.push(gotParams[i]);
    }

    return {neighborsInfo};
}


function main() {
    // get the parameters from the command line
    const startArgu = getParamsHelper();

    connectNeighborsHelper(startArgu.neighborsInfo);

}

main();