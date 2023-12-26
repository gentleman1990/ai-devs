const apiCall = async (endpoint = 'token', method = 'GET', body = {}) => {
    const response = await fetch(`https://zadania.aidevs.pl/${endpoint}`, {
        method,
        body: method === 'POST' ? JSON.stringify(body) : undefined,
    });
    return response.status === 204 ? true : await response.json();
}

export const authorize = async (taskName: string) => {
     const token = await apiCall(`token/${taskName}`, 'POST', {apikey: process.env.AI_DEV_APIKEY})
     return token.token
}

export const getInputData = async (token: string, taskName: string) => {
   const inputData = await apiCall(`task/${token}`)
   return inputData;
}

export const sendAnswer = async(token: string, answer: string) => {
    const response = await apiCall(`answer/${token}`, 'POST', {answer: answer})
    console.log(response);

}


