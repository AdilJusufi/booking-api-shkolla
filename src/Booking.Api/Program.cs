using System.Threading.RateLimiting;
using Booking.Api.Filters;
using Booking.Api.Middleware;
using Booking.Api.Services;
using Booking.Application;
using Booking.Application.Common.Interfaces;
using Booking.Infrastructure;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.OpenApi.Models;
using Serilog;
using Serilog.Context;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    Log.Information("Duke startuar Booking API...");

    var builder = WebApplication.CreateBuilder(args);

    // Para çdo gjëje tjetër: nëse mjedisi dhe konfigurimi janë në një kombinim të pamundur
    // (Development kundër një DB-je të largët, ose seed i ndezur në prodhim), rrëzohu tani —
    // përpara migrimeve, seed-it dhe kërkesës së parë. Shih EnvironmentGuard.
    Booking.Api.Startup.EnvironmentGuard.Validate(builder.Environment.EnvironmentName, builder.Configuration);

    builder.Host.UseSerilog((context, loggerConfiguration) =>
        loggerConfiguration.ReadFrom.Configuration(context.Configuration));

    builder.Services.AddApplication();
    builder.Services.AddInfrastructure(builder.Configuration, builder.Environment.IsDevelopment());

    builder.Services.AddHttpContextAccessor();
    builder.Services.AddScoped<ICurrentUserService, CurrentUserService>();

    // Enum-et dalin si numra (jo si string) — frontend-i i pret kështu
    // (p.sh. AppointmentStatus, DayOfWeek) dhe krahason vlera numerike.
    builder.Services
        .AddControllers(options => options.Filters.Add<FluentValidationFilter>());

    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(options =>
    {
        options.SwaggerDoc("v1", new OpenApiInfo
        {
            Title = "Booking API",
            Version = "v1",
            Description = "API për rezervimin e termineve në klinika private në Prishtinë."
        });

        options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
        {
            Name = "Authorization",
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            In = ParameterLocation.Header,
            Description = "Vendos access token-in nga /api/auth/login (pa prefiksin 'Bearer')."
        });
        options.AddSecurityRequirement(new OpenApiSecurityRequirement
        {
            {
                new OpenApiSecurityScheme
                {
                    Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
                },
                Array.Empty<string>()
            }
        });
    });

    // Rate limiting: login/register sipas IP-së, krijimi i rezervimeve sipas userit.
    // Limitet janë të konfigurueshme (testet i rrisin që të mos marrin 429).
    var authPermitLimit = builder.Configuration.GetValue<int?>("RateLimiting:AuthPermitLimit") ?? 10;
    var bookingPermitLimit = builder.Configuration.GetValue<int?>("RateLimiting:BookingPermitLimit") ?? 20;
    var patientSearchPermitLimit = builder.Configuration.GetValue<int?>("RateLimiting:PatientSearchPermitLimit") ?? 30;
    var emailSendPermitLimit = builder.Configuration.GetValue<int?>("RateLimiting:EmailSendPermitLimit") ?? 5;
    var emailSendWindowMinutes = builder.Configuration.GetValue<int?>("RateLimiting:EmailSendWindowMinutes") ?? 5;

    builder.Services.AddRateLimiter(options =>
    {
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

        options.AddPolicy("auth", httpContext => RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = authPermitLimit,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

        // Kërkimi i pacientëve ndahet SIPAS USERIT, jo IP-së: një recepsion i tërë
        // del nga një IP e vetme, kështu që ndarja sipas IP-je do t'i bënte kolegët
        // të hanin buxhetin e njëri-tjetrit. Kufiri ekziston kundër enumerimit të
        // bazës së pacientëve nga një llogari e vetme e komprometuar.
        options.AddPolicy("patient-search", httpContext => RateLimitPartition.GetFixedWindowLimiter(
            httpContext.User.Identity?.Name
                ?? httpContext.Connection.RemoteIpAddress?.ToString()
                ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = patientSearchPermitLimit,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

        options.AddPolicy("booking", httpContext => RateLimitPartition.GetFixedWindowLimiter(
            httpContext.User.Identity?.Name
                ?? httpContext.Connection.RemoteIpAddress?.ToString()
                ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = bookingPermitLimit,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

        // forgot-password / resend-confirmation: më i rreptë se "auth" qëllimisht — këto
        // dy të vetmet endpoint-e publike e zgjedhin VETË kujt t'i dërgojnë email, kështu
        // që 10/min do të lejonte të njëjtin IP të "provonte" dhjetëra adresa të ndryshme
        // për minutë. Kjo shtresë kap enumerimin nga një IP i vetëm; kufizimi për-adresë
        // (cooldown + tavan ditor, pavarësisht IP-së) jeton te IEmailAbuseGuard, jo këtu —
        // 429-ja këtu s'zbulon asgjë për asnjë adresë specifike, thjesht "ky IP po ngutet".
        options.AddPolicy("email-send", httpContext => RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = emailSendPermitLimit,
                Window = TimeSpan.FromMinutes(emailSendWindowMinutes),
                QueueLimit = 0
            }));
    });

    var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];

    // Një listë bosh nuk dështon në startup — thjesht bllokon çdo browser, dhe kjo
    // duket si "API-ja s'punon" në frontend. Jashtë Development-it e bëjmë të dukshme.
    if (allowedOrigins.Length == 0 && !builder.Environment.IsDevelopment())
    {
        Log.Warning(
            "Cors:AllowedOrigins është bosh në mjedisin {Environment} — çdo kërkesë nga browser-i do të bllokohet. " +
            "Vendos origjinat e frontend-it (p.sh. me Cors__AllowedOrigins__0).",
            builder.Environment.EnvironmentName);
    }

    builder.Services.AddCors(options =>
        options.AddPolicy("Frontend", policy =>
            policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));

    var cloudinarySection = builder.Configuration.GetSection("Cloudinary");
    if (string.IsNullOrWhiteSpace(cloudinarySection["CloudName"])
        || string.IsNullOrWhiteSpace(cloudinarySection["ApiKey"])
        || string.IsNullOrWhiteSpace(cloudinarySection["ApiSecret"]))
    {
        Log.Warning(
            "Cloudinary:CloudName/ApiKey/ApiSecret mungojnë — ngarkimi i logos së klinikës do të dështojë " +
            "derisa të konfigurohen (p.sh. me Cloudinary__ApiSecret).");
    }

    // Vetëm jashtë Development-it: atje IEmailService është qëllimisht LoggingEmailService
    // (shih AddInfrastructure), kështu që Resend s'përdoret fare dhe paralajmërimi do të
    // ishte zhurmë e rreme, ndryshe nga Cloudinary që përdoret edhe lokalisht.
    if (!builder.Environment.IsDevelopment())
    {
        var resendSection = builder.Configuration.GetSection("Resend");
        if (string.IsNullOrWhiteSpace(resendSection["ApiKey"]) || string.IsNullOrWhiteSpace(resendSection["FromAddress"]))
        {
            Log.Warning(
                "Resend:ApiKey/FromAddress mungojnë — dërgimi i email-eve (konfirmim llogarie, rivendosje " +
                "fjalëkalimi, njoftime klinike) do të dështojë derisa të konfigurohen (p.sh. me Resend__ApiKey).");
        }

        // KRITIK, jo thjesht "mungon një komoditet": pa këtë, AuthService.BuildAuthLink
        // hedh përjashtim për çdo email konfirmimi/rivendosjeje (shih koment atje) — asnjë
        // user nuk konfirmon dot llogarinë, dhe RequireConfirmedEmail=true e mban të
        // kyçur jashtë përgjithmonë. Kjo saktësisht ndodhi në prodhim një herë (linku
        // mungonte, doli tokeni i papërpunuar) — ky warning duhet ta kishte kapur në
        // logjet e deploy-it, jo pas raportimit të një useri real.
        if (string.IsNullOrWhiteSpace(builder.Configuration["Frontend:BaseUrl"]))
        {
            Log.Warning(
                "Frontend:BaseUrl mungon — KONFIRMIMI I EMAIL-IT DHE RIVENDOSJA E PASSWORD-IT DO TË DËSHTOJNË " +
                "për çdo user (asnjë link s'mund të ndërtohet). Vendose me env var Frontend__BaseUrl " +
                "(p.sh. https://www.rezervomjekun.com).");
        }
    }

    // Pa këtë, HttpContext.Connection.RemoteIpAddress është adresa e PROXY-t të Render-it,
    // e njëjtë për çdo klient në botë. Pasojat janë konkrete, jo teorike:
    //   • Limituesit "auth" dhe "email-send" ndajnë sipas IP-së. Me një IP të vetme për të
    //     gjithë, 10 kërkesa/min bëhen një buxhet GLOBAL: një sulmues i vetëm i nxjerr të
    //     gjithë përdoruesit me 429. (Riprodhuar lokalisht: 5 klientë të ndryshëm, një kovë.)
    //   • Kolonat RefreshToken.IpAddress dhe EmailSendAttempt.IpAddress ruajnë një vlerë
    //     konstante e të padobishme — pikërisht kur duhen për hetim incidenti.
    //   • Pa XForwardedProto, aplikacioni e sheh trafikun e proxy-uar HTTPS si HTTP dhe
    //     UseHttpsRedirection provon një ridrejtim që klienti e ka kryer tashmë.
    //
    // ForwardLimit = 1 është mbrojtja kundër falsifikimit, dhe arsyeja pse pastrimi i
    // KnownProxies më poshtë NUK e bën header-in të besueshëm verbërisht: proxy-ja e
    // Render-it e SHTON adresën reale të klientit në FUND të X-Forwarded-For, dhe
    // middleware-i lexon nga e djathta. Nëse një klient dërgon "X-Forwarded-For: 9.9.9.9",
    // proxy-ja e kthen në "9.9.9.9, <klienti-real>" — ne marrim vetëm hyrjen e fundit, pra
    // atë që e vëzhgoi vetë proxy-ja dhe që klienti s'e kontrollon dot.
    //
    // KnownNetworks/KnownProxies pastrohen sepse Render nuk publikon një varg të qëndrueshëm
    // IP-sh hyrëse për proxy-n e vet; container-i nuk është i arritshëm drejtpërdrejt nga
    // interneti, prandaj peer-i i menjëhershëm është GJITHMONË proxy-ja e platformës.
    //
    // KUJDES: nëse ky API ndonjëherë vendoset PA një reverse proxy të besuar përpara,
    // vendos ForwardedHeaders__Enabled=false — përndryshe çdo klient do të mund të
    // deklaronte IP-në e vet dhe t'i shpëtonte rate limiter-it.
    var forwardedHeadersEnabled = builder.Configuration.GetValue<bool?>("ForwardedHeaders:Enabled") ?? true;
    if (forwardedHeadersEnabled)
    {
        builder.Services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.ForwardLimit = 1;
            options.KnownNetworks.Clear();
            options.KnownProxies.Clear();
        });
    }

    builder.Services.AddHealthChecks()
        .AddNpgSql(
            builder.Configuration.GetConnectionString("BookingDb") ?? string.Empty,
            name: "postgresql",
            tags: ["db"]);

    var app = builder.Build();

    // Kapja e DTO-ve pa validator — shih ValidatorCoverage për arsyen pse heshtja e
    // FluentValidationFilter është problemi.
    //
    // Rrëzon VETËM jashtë prodhimit, dhe kjo është zgjedhje e qëllimshme, jo gjysmake:
    // një validator që mungon do të thotë hyrje e pavaliduar në një endpoint — e keqe, por
    // e lokalizuar. Rrëzimi i të gjithë API-t në deploy do ta shndërronte një hendek në një
    // ndërprerje totale, pra një kurë më të keqe se sëmundja. Në zhvillim dhe në testet e
    // integrimit (që e ngrenë të njëjtin Program) dështimi është i menjëhershëm dhe i
    // pashmangshëm, kështu që problemi kapet para se të mbërrijë ndonjëherë në prodhim;
    // atje mbetet një log Error, i cili tashmë monitorohet.
    var unvalidated = Booking.Api.Startup.ValidatorCoverage.FindUnvalidatedPayloadTypes(
        app.Services,
        typeof(Program).Assembly,
        typeof(Booking.Application.DependencyInjection).Assembly);

    if (unvalidated.Count > 0)
    {
        var names = string.Join(", ", unvalidated.Select(t => t.Name));
        var message =
            $"Këto DTO lidhen nga një action kontrolleri por s'kanë IValidator<T> të regjistruar: {names}. "
            + "FluentValidationFilter i kalon pa i validuar, në heshtje. Shto një AbstractValidator<T> "
            + "për secilin (edhe bosh, nëse s'ka çfarë të validohet).";

        if (app.Environment.IsProduction())
        {
            Log.Error("{Message}", message);
        }
        else
        {
            throw new InvalidOperationException(message);
        }
    }

    // Migrations + rolet + seed data (kontrollohen nga konfigurimi).
    await Booking.Infrastructure.Persistence.DbSeeder.InitializeAsync(app.Services, app.Configuration);

    // I PARI në pipeline, me qëllim: çdo gjë pas kësaj (log-et e Serilog-ut, rate limiter-i,
    // UseHttpsRedirection, CurrentUserService.IpAddress) duhet të shohë adresën reale të
    // klientit dhe skemën reale, jo ato të proxy-t. Shih komentin te konfigurimi më lart.
    if (forwardedHeadersEnabled)
    {
        app.UseForwardedHeaders();
    }

    // Correlation ID: pranohet nga klienti ose gjenerohet; kthehet gjithmonë në response
    // dhe futet në çdo log të kërkesës.
    app.Use(async (context, next) =>
    {
        const string headerName = "X-Correlation-Id";
        var correlationId = context.Request.Headers.TryGetValue(headerName, out var value) && !string.IsNullOrWhiteSpace(value)
            ? value.ToString()
            : context.TraceIdentifier;

        context.Response.Headers[headerName] = correlationId;
        using (LogContext.PushProperty("CorrelationId", correlationId))
        {
            await next();
        }
    });

    app.UseSerilogRequestLogging(options =>
    {
        options.EnrichDiagnosticContext = (diagnosticContext, httpContext) =>
        {
            var userId = httpContext.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            diagnosticContext.Set("UserId", userId ?? "anonymous");
        };
    });

    app.UseMiddleware<ExceptionHandlingMiddleware>();

    if (app.Environment.IsDevelopment())
    {
        app.UseSwagger();
        app.UseSwaggerUI();
    }
    else
    {
        app.UseHsts();
    }

    app.UseHttpsRedirection();

    // Security headers bazë.
    app.Use(async (context, next) =>
    {
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers["X-Frame-Options"] = "DENY";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        await next();
    });

    app.UseCors("Frontend");
    app.UseRateLimiter();
    app.UseAuthentication();
    app.UseAuthorization();

    app.MapControllers();
    app.MapHealthChecks("/health");

    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Booking API dështoi në startim");

    // Pa këtë procesi dilte me kod 0: një dështim nisjeje dukej si mbyllje normale, dhe
    // platforma s'kishte si ta dallonte një container që s'u ngrit kurrë nga një që
    // përfundoi punën. Kjo vlen për ÇDO gabim nisjeje, jo vetëm për EnvironmentGuard —
    // por pikërisht guard-i e bën dallimin domethënës: një ndalim i qëllimshëm duhet të
    // duket si dështim, përndryshe deploy-i raportohet i suksesshëm.
    Environment.ExitCode = 1;
}
finally
{
    Log.CloseAndFlush();
}

// E nevojshme që WebApplicationFactory<Program> të funksionojë në testet e integrimit.
public partial class Program
{
}
