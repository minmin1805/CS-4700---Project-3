import dgram from "dgram";

let portsMap = new Map();
let relationshipMap = new Map();
let socketMap = new Map();
let asnNumber;

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

    for(let i = 1; i < gotParams.length; i++) {

        // save each neighbor'info into the corresponding map
        const splitByHyphen = gotParams[i].split("-");
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


function main() {
    // get the parameters from the command line
    const startArgu = getParamsHelper();

}