using System.Data.Common;
using System.Net;

namespace Booking.Api.Startup;

/// <summary>
/// Ndalon nisjen kur mjedisi dhe konfigurimi janë në një kombinim që s'duhet të ekzistojë
/// kurrë. Të dyja kontrollet mbrojnë nga i njëjti gabim me një fjalë: një
/// ASPNETCORE_ENVIRONMENT i vendosur gabim.
///
/// Pse rrëzim dhe jo paralajmërim: nëse appsettings.Development.json aktivizohet në një
/// mjedis të vendosur, ai sjell njëherësh RequireConfirmedEmail=false, Seed:Enabled=true
/// (llogari me password të njohur publikisht në repo) dhe migrime automatike në nisje.
/// Një Warning në log do të humbte mes rreshtave të deploy-it; një proces që s'niset fare
/// e ndalon dëmin para se të pranohet kërkesa e parë.
/// </summary>
public static class EnvironmentGuard
{
    private const string DevelopmentEnvironment = "Development";

    public static void Validate(string environmentName, IConfiguration configuration)
    {
        var isDevelopment = string.Equals(environmentName, DevelopmentEnvironment, StringComparison.OrdinalIgnoreCase);
        var connectionString = configuration.GetConnectionString("BookingDb");

        // 1. Development i drejtuar nga një databazë jo-lokale = pothuajse me siguri një
        //    mjedis i vendosur që mendon se është laptop.
        //    Dalja e vetme është e qëllimshme dhe e shprehur: dikush që vërtet punon
        //    kundër një DB-je të largët zhvillimi e vendos flamurin, në vend që ta heqë
        //    fare kontrollin sepse "po pengon".
        var allowRemoteDb = configuration.GetValue<bool>("Development:AllowRemoteDatabase");
        if (isDevelopment
            && !allowRemoteDb
            && !string.IsNullOrWhiteSpace(connectionString)
            && !PointsAtLoopback(connectionString))
        {
            throw new InvalidOperationException(
                "NISJA U NDAL: ASPNETCORE_ENVIRONMENT=Development, por ConnectionStrings:BookingDb "
                + "nuk tregon te localhost. Kjo aktivizon appsettings.Development.json kundër një "
                + "databaze jo-lokale: konfirmimi i email-it fiket, seed-i krijon llogari me password "
                + "të njohur nga repo-ja, dhe migrimet aplikohen automatikisht. "
                + "Vendos ASPNETCORE_ENVIRONMENT=Production, ose — nëse kjo është vërtet e qëllimshme — "
                + "Development__AllowRemoteDatabase=true.");
        }

        // 2. Ana tjetër e të njëjtës medalje: seed-i i ndezur jashtë Development-it krijon
        //    llogari me password-e që ndodhen në kontrollin e versionit.
        if (!isDevelopment && configuration.GetValue<bool>("Seed:Enabled"))
        {
            throw new InvalidOperationException(
                $"NISJA U NDAL: Seed:Enabled=true në mjedisin '{environmentName}'. Seed-i krijon "
                + "llogari me password-e të marra nga konfigurimi i zhvillimit, të cilat janë publike "
                + "në repo. Vendos Seed__Enabled=false.");
        }
    }

    /// <summary>
    /// Host-i nxirret duke e PARSUAR connection string-un, jo me kërkim nënvargu: një
    /// kontroll i tipit Contains("localhost") kalohet nga
    /// "Host=prod.example.com;ApplicationName=localhost" dhe rrëzohet gabimisht nga
    /// "Host=localhost-replica.example.com". Npgsql lejon disa host-e të ndarë me presje
    /// (failover), prandaj TË GJITHË duhet të jenë loopback.
    /// </summary>
    public static bool PointsAtLoopback(string connectionString)
    {
        var builder = new DbConnectionStringBuilder();
        try
        {
            builder.ConnectionString = connectionString;
        }
        catch (ArgumentException)
        {
            // I padeshifrueshëm — mos e trajto si të sigurt.
            return false;
        }

        // Npgsql e quan "Host"; "Server" pranohet si sinonim.
        var host = TryGet(builder, "host") ?? TryGet(builder, "server");

        // Pa host të shprehur Npgsql bie te localhost.
        if (string.IsNullOrWhiteSpace(host))
        {
            return true;
        }

        var entries = host.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return entries.Length > 0 && entries.All(IsLoopbackHost);
    }

    private static string? TryGet(DbConnectionStringBuilder builder, string key) =>
        builder.TryGetValue(key, out var value) ? value as string : null;

    private static bool IsLoopbackHost(string host)
    {
        host = host.Trim();
        if (host.Length == 0)
        {
            return false;
        }

        // "[::1]:5432" ose "[::1]" — kllapat rrethojnë një adresë IPv6.
        if (host.StartsWith('['))
        {
            var close = host.IndexOf(']');
            if (close <= 0)
            {
                return false;
            }
            host = host[1..close];
        }
        else
        {
            // "localhost:5432" → hiq portin. Një IPv6 pa kllapa ("::1") ka disa dy-pikësha,
            // prandaj hiqet vetëm kur ka saktësisht një dhe pjesa pas tij është numër.
            var lastColon = host.LastIndexOf(':');
            if (lastColon > 0
                && host.IndexOf(':') == lastColon
                && int.TryParse(host.AsSpan(lastColon + 1), out _))
            {
                host = host[..lastColon];
            }
        }

        if (string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        // Kap gjithë 127.0.0.0/8 dhe ::1 pa i renditur me dorë.
        return IPAddress.TryParse(host, out var ip) && IPAddress.IsLoopback(ip);
    }
}
