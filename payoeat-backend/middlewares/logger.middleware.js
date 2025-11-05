const loggerMiddleware = (req, res, next) => {
  const start = Date.now();
  const method = req.method;
  const url = req.originalUrl;
  const timestamp = new Date().toISOString();

  // Log the incoming request
  console.log(`[${timestamp}] ${method} ${url} - Request received`);

  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - start;
    const status = res.statusCode;
    
    // Log the response with timing
    console.log(`[${timestamp}] ${method} ${url} - ${status} - ${duration}ms`);
    
    // Call the original end method
    originalEnd.apply(this, args);
  };

  next();
};

export default loggerMiddleware;