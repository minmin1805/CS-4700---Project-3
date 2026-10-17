const dgram = require("dgram");

let portsMap = new Map();
let relationshipMap = new Map();
let socketMap = new Map();
let asnNumber;

const maskMap = new Map();
maskMap.set("0", "00000000");
maskMap.set("128", "10000000");
maskMap.set("192", "11000000");
maskMap.set("224", "11100000");
maskMap.set("240", "11110000");
maskMap.set("248", "11111000");
maskMap.set("252", "11111100");
maskMap.set("254", "11111110");
maskMap.set("255", "11111111");



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

function andMaskChecker(destinationId, network, netmask) {
    const destinationIdArray = destinationId.split(".");
    const networkArray = network.split(".");
    const netmaskArray = netmask.split(".");
    // and mask for destinationId and network if they are same then return true
    const andMask = [];
    for(let i = 0; i < 4; i++) {
        andMask.push(maskMap.get(netmaskArray[i]));
    }
    const andMaskString = andMask.join("");
    const desBinary = [];
    for(let i = 0; i < 4; i++) {
        let bits = Number(destinationIdArray[i]).toString(2);
        while(bits.length < 8) {
            bits = "0" + bits;
        }
        desBinary.push(bits);
    }
    const desBinaryString = desBinary.join("");

    const networkBinary = [];
    for(let i = 0; i < 4; i++) {
        let bits = Number(networkArray[i]).toString(2);
        while(bits.length < 8) {
            bits = "0" + bits;
        }
        networkBinary.push(bits);
    }
    const networkBinaryString = networkBinary.join("");

    // and for desBinaryString with andMaskString then compare with networkBinaryString with andMaskString
    const desAndMask = [];
    for(let i = 0; i < andMaskString.length; i++) {
        desAndMask.push(desBinaryString[i] & andMaskString[i]);
    }
    const desAndMaskString = desAndMask.join("");
    const networkAndMask = [];
    for(let i = 0; i < andMaskString.length; i++) {
        networkAndMask.push(networkBinaryString[i] & andMaskString[i]);
    }
    const networkAndMaskString = networkAndMask.join("");
    if(desAndMaskString === networkAndMaskString) {
        return true;
    }
    return false;
}

function ipToIntConverter(ip) {
    const ipArray = ip.split(".");
    let value = 0;
    for(let i = 0; i < 4; i++) {
        value += Number(ipArray[i]) * Math.pow(256, 3 - i);
    }
    return value;
}

function checkSelfOriginHelper(currentBestRoute, potentialRoute) {
    if(currentBestRoute.selfOrigin == true && potentialRoute.selfOrigin == false) {
        return currentBestRoute;
    }
    else if(currentBestRoute.selfOrigin == false && potentialRoute.selfOrigin == true) {
        return potentialRoute;
    }
    else {
        return null;
    }
}

function checkASPathHelper(currentBestRoute, potentialRoute) {
    if(currentBestRoute.ASPath.length < potentialRoute.ASPath.length) {
        return currentBestRoute;
    }
    else if(currentBestRoute.ASPath.length > potentialRoute.ASPath.length) {
        return potentialRoute;
    }
    else {
        return null;
    }
}

function checkOriginHelper(currentBestRoute, potentialRoute) {
    if(currentBestRoute.origin == "IGP" && (potentialRoute.origin == "EGP" || potentialRoute.origin == "UNK")) {
        return currentBestRoute;
    }
    else if(currentBestRoute.origin == "EGP" && potentialRoute.origin == "UNK") {
        return currentBestRoute;
    }
    else if(potentialRoute.origin == "IGP" && (currentBestRoute.origin == "EGP" || currentBestRoute.origin == "UNK")) {
        return potentialRoute;
    }
    else if(potentialRoute.origin == "EGP" && currentBestRoute.origin == "UNK") {
        return potentialRoute;
    }
    else {
        return null;
    }
}

function checkPeerIpHelper(currentBestRoute, potentialRoute) {
    const currentBestRouteNum = ipToIntConverter(currentBestRoute.peer);
    const potentialRouteNum = ipToIntConverter(potentialRoute.peer);
    if(currentBestRouteNum < potentialRouteNum) {
        return currentBestRoute;
    }
    else if(currentBestRouteNum > potentialRouteNum) {
        return potentialRoute;
    }
    else {
        return currentBestRoute;
    }
}

function rankingHelper(currentBestRoute, potentialRoute) {
    // check localpref
    if(currentBestRoute.localpref > potentialRoute.localpref) {
        return currentBestRoute;
    }
    else if(currentBestRoute.localpref < potentialRoute.localpref) {
        return potentialRoute;
    }
    else{
        // check selfOrigin
        const selfOriginWinner = checkSelfOriginHelper(currentBestRoute, potentialRoute);
        if(selfOriginWinner !== null) {
            return selfOriginWinner;
        }
        else {
            // check ASPath (shorter wins)
            const asPathWinner = checkASPathHelper(currentBestRoute, potentialRoute);
            if(asPathWinner !== null) {
                return asPathWinner;
            }
            else {
                // check origin( IGP > EGP > UNK)
                const originWinner = checkOriginHelper(currentBestRoute, potentialRoute);
                if(originWinner !== null) {
                    return originWinner;
                }
                else {
                    //compare lowest ip number
                    return checkPeerIpHelper(currentBestRoute, potentialRoute);
                }
            }
        }
    }
}

function helperToFindBestRoute(destinationId) {
    let currentBestRoute = null;
    for(let i  = 0; i < announcementStorage.length; i++) {
        const announcement = announcementStorage[i];
        if(andMaskChecker(destinationId, announcement.network, announcement.netmask)) {
            if(currentBestRoute === null) {
                currentBestRoute = announcement;
            }
            else {
                currentBestRoute = rankingHelper(currentBestRoute, announcement);
            }
        }
    }

    return currentBestRoute;
}


function handleDataHelper(neighborIp, receivedInfo) {
    // level 1 version for now
    // find the route that cover
    const destinationId = receivedInfo.dst;

    const bestRouteToSend = helperToFindBestRoute(destinationId);
    if(bestRouteToSend === null) {
        return;
    }
    const messageObject = {
        src: receivedInfo.src,
        dst: receivedInfo.dst,
        type: "data",
        msg: receivedInfo.msg,
    }
    const infoToSend = JSON.stringify(messageObject);
    socketMap.get(bestRouteToSend.peer).send(infoToSend, portsMap.get(bestRouteToSend.peer), "127.0.0.1");
}

function handleDumpHelper(neighborIp, receivedInfo) {
    // for now get all the announcement from the announcementStorage
    const messageObject = [];
    for(let i = 0; i < announcementStorage.length; i++) {
        const announcement = announcementStorage[i];
        const announcementCopy = {
            network: announcement.network,
            netmask: announcement.netmask,
            localpref: announcement.localpref,
            selfOrigin: announcement.selfOrigin,
            ASPath: announcement.ASPath,
            origin: announcement.origin,
            peer: announcement.peer,
        }
        messageObject.push(announcementCopy);
    }
    const objectToSend = {
        src: srcConvertedHelper(neighborIp),
        dst: neighborIp,
        type: "table",
        msg: messageObject,
    }
    const infoToSend = JSON.stringify(objectToSend);
    socketMap.get(neighborIp).send(infoToSend, portsMap.get(neighborIp), "127.0.0.1");
    }


function main() {
    // get the parameters from the command line
    const startArgu = getParamsHelper();

    connectNeighborsHelper(startArgu.neighborsInfo);

}

main();