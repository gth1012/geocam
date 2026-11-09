package com.arteon.geocam;
import org.junit.Test;
import static org.junit.Assert.assertEquals;
public class HdrValueCheckTest {
 @Test public void exactZero(){assertEquals("REQUEST_RESULT_ZERO_MATCH",HdrValueCheck.status(new int[]{0},new int[]{0},true));}
 @Test public void noOverride(){assertEquals("NO_OVERRIDE",HdrValueCheck.status(new int[]{0},new int[]{0},false));}
 @Test public void missingRequest(){assertEquals("REQUEST_NOT_REPORTED",HdrValueCheck.status(null,new int[]{0},true));}
 @Test public void missingResult(){assertEquals("RESULT_NOT_REPORTED",HdrValueCheck.status(new int[]{0},null,true));}
 @Test public void scalarRejected(){assertEquals("INVALID_TYPE",HdrValueCheck.status(0,new int[]{0},true));}
 @Test public void lengthRejected(){assertEquals("INVALID_LENGTH",HdrValueCheck.status(new int[]{0},new int[]{0,0},true));}
 @Test public void requestDefaultRejected(){assertEquals("REQUEST_NOT_ZERO",HdrValueCheck.status(new int[]{2},new int[]{0},true));}
 @Test public void resultDefaultRejected(){assertEquals("RESULT_NOT_ZERO",HdrValueCheck.status(new int[]{0},new int[]{2},true));}
}
