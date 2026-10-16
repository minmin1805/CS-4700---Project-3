import dgram from "dgram";

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
        ASPath: storedAnnouncement.updatedASPath,
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

function handleHandshakeHelper(neighborIp, receivedInfo) {

    // store the announcement into the announcementStorage
    const storedAnnouncement = {
        network: receivedInfo.src,
        netmask: receivedInfo.netmask,
        localpref: receivedInfo.localpref,
        selfOrigin: receivedInfo.selfOrigin,
        ASPath: receivedInfo.ASPath,
        origin: receivedInfo.origin,
        peer: neighborIp
    }
    announcementStorage.push(storedAnnouncement);

    // determine which neighbor to send the announcement to
    // if the announce is from customer then tell all neighbor, if peer or provider then only tell the customer

    const typeOfAnnouncement = relationshipMap.get(neighborIp);
    //if is customer 
    if(typeOfAnnouncement === "customer") {
        // tell all neighbor
        for(let i = 0; i < relationshipMap.size; i++) {
            const anotherNeighbor = relationshipMap.keys()[i];
            if(anotherNeighbor !== neighborIp) {
                sendAnnouncementHelper(anotherNeighbor, storedAnnouncement);
            }   
        }
    }
    else if(typeOfAnnouncement === "peer" || typeOfAnnouncement === "provider") {
        // tell the customer
        for(let i = 0; i < relationshipMap.size; i++) {
            const anotherNeighbor = relationshipMap.keys()[i];
            if(anotherNeighbor !== neighborIp && relationshipMap.get(anotherNeighbor) === "customer") {
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
        const neighborPort = splitByHyphen[0];
        const neighborRelationship = splitByHyphen[2];

        portsMap.set(neighborIp, neighborPort);
        relationshipMap.set(neighborIp, neighborRelationship);
        socketMap.set(neighborIp, null);
    }

    //create a socket for each neighbor 
    for(let i = 0; i < socketMap.length; i++) {
        const neighborIp = socketMap.keys()[i];

        const hostIp = "127.0.0.1";

        const createdSocket = dgram.createSocket("udp4");

        createdSocket.bind(portsMap.get(neighborIp), hostIp);
        socketMap.set(neighborIp, createdSocket);

        //send handshake to the neighbor
        sendHandshakeHelper(neighborIp);

        //make socket listen to the neighbor
        createdSocket.on("message", (msg, neighborIp) => {
            const receivedInfo = JSON.parse(msg.toString());

            // determine which operation the neighbor wants to perform
            const type = receivedInfo.type;
            if(type === "handshake") {
                handleHandshakeHelper(neighborIp, receivedInfo);
            } else if(type === "update") {
                handleUpdateHelper(neighborIp, receivedInfo);
            } else if(type === "withdraw") {
                handleWithdrawHelper(neighborIp, receivedInfo);
            } else if(type === "data") {
                handleDataHelper(neighborIp, receivedInfo);
            } else if(type === "dump") {
                handleDumpHelper(neighborIp, receivedInfo);
            }
        });
    }
}

//the same ip number but the last number change from 2 to 1
function srcConvertedHelper(asnNumber) {
    const ipArray = asnNumber.split(".");
    ipArray[3] = "1";
    return ipArray.join(".");
}

function sendHandshakeHelper(neighborIp) {
    const srcConverted = srcConvertedHelper(asnNumber);
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

    asnNumber = gotParams[0];

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