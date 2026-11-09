package com.arteon.geocam;
final class HdrValueCheck {
    static String status(Object request,Object result,boolean applied){
        if(!applied)return "NO_OVERRIDE";
        if(request==null)return "REQUEST_NOT_REPORTED";
        if(result==null)return "RESULT_NOT_REPORTED";
        if(!(request instanceof int[])||!(result instanceof int[]))return "INVALID_TYPE";
        int[] q=(int[])request,r=(int[])result;
        if(q.length!=1||r.length!=1)return "INVALID_LENGTH";
        if(q[0]!=0)return "REQUEST_NOT_ZERO";
        if(r[0]!=0)return "RESULT_NOT_ZERO";
        return "REQUEST_RESULT_ZERO_MATCH";
    }
}
