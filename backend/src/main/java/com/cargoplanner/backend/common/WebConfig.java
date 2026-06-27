package com.cargoplanner.backend.common;

import com.cargoplanner.backend.auth.AdminAuthInterceptor;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {
  private final AdminAuthInterceptor adminAuthInterceptor;
  private final UserAuthInterceptor userAuthInterceptor;

  public WebConfig(AdminAuthInterceptor adminAuthInterceptor, UserAuthInterceptor userAuthInterceptor) {
    this.adminAuthInterceptor = adminAuthInterceptor;
    this.userAuthInterceptor = userAuthInterceptor;
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry.addMapping("/api/**")
        .allowedOriginPatterns("*")
        .allowedMethods("GET", "POST", "PATCH", "DELETE", "OPTIONS")
        .allowedHeaders("*")
        .exposedHeaders("X-Auth-Token");
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry.addInterceptor(userAuthInterceptor)
        .addPathPatterns("/api/**")
        .excludePathPatterns("/api/auth/login");
    registry.addInterceptor(adminAuthInterceptor).addPathPatterns("/api/admin/**");
  }
}
