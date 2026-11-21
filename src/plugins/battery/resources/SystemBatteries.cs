using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static class Program
{
    const uint FILTER_PRESENT = 0x100, FILTER_CLASS = 0x200;
    const string BLUETOOTH_CLASS = "{e0cbf06c-cd8b-4647-bb8a-263b43f0f974}";

    [StructLayout(LayoutKind.Sequential)]
    struct PropertyKey { public Guid Fmtid; public uint Pid; }
    static PropertyKey Key(string guid, uint pid) { PropertyKey key; key.Fmtid = new Guid(guid); key.Pid = pid; return key; }

    static readonly PropertyKey BATTERY = Key("104EA319-6EE2-4701-BD47-8DDBF425BBE5", 2);
    static readonly PropertyKey CONNECTED = Key("83DA6326-97A6-4088-9453-A1923F573B29", 15);
    static readonly PropertyKey NAME = Key("b725f130-47ef-101a-a5f1-02608c9eebac", 10);

    [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode)]
    static extern int CM_Get_Device_ID_List_SizeW(out int length, string filter, uint flags);
    [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode)]
    static extern int CM_Get_Device_ID_ListW(string filter, char[] buffer, int length, uint flags);
    [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode)]
    static extern int CM_Locate_DevNodeW(out uint node, string id, uint flags);
    [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode)]
    static extern int CM_Get_DevNode_PropertyW(uint node, ref PropertyKey key, out uint type, byte[] buffer, ref int size, uint flags);

    [StructLayout(LayoutKind.Sequential)]
    struct PadBattery { public byte Type; public byte Level; }
    [DllImport("xinput1_4.dll")]
    static extern uint XInputGetBatteryInformation(uint user, byte deviceType, out PadBattery info);

    static byte[] Read(uint node, PropertyKey key)
    {
        uint type;
        int size = 512;
        byte[] buffer = new byte[size];
        if (CM_Get_DevNode_PropertyW(node, ref key, out type, buffer, ref size, 0) != 0) return null;
        Array.Resize(ref buffer, size);
        return buffer;
    }

    static void Bluetooth(List<string> found)
    {
        uint flags = FILTER_CLASS | FILTER_PRESENT;
        int length;
        if (CM_Get_Device_ID_List_SizeW(out length, BLUETOOTH_CLASS, flags) != 0) return;
        char[] ids = new char[length];
        if (CM_Get_Device_ID_ListW(BLUETOOTH_CLASS, ids, length, flags) != 0) return;
        foreach (string id in new string(ids).Split(new[] { '\0' }, StringSplitOptions.RemoveEmptyEntries))
        {
            uint node;
            if (CM_Locate_DevNodeW(out node, id, 0) != 0) continue;
            byte[] battery = Read(node, BATTERY);
            if (battery == null || battery.Length < 1) continue;
            byte[] connected = Read(node, CONNECTED);
            byte[] name = Read(node, NAME);
            string label = name == null ? "Bluetooth device" : Encoding.Unicode.GetString(name).TrimEnd('\0');
            found.Add(Entry("bt:" + id, label, "bluetooth", battery[0], connected == null || connected[0] != 0));
        }
    }

    static void XInput(List<string> found)
    {
        int[] levels = { 5, 35, 65, 100 };
        try
        {
            for (uint slot = 0; slot < 4; slot++)
            {
                PadBattery info;
                if (XInputGetBatteryInformation(slot, 0, out info) != 0) continue;
                if (info.Type != 2 && info.Type != 3) continue;
                found.Add(Entry("xinput:" + slot, "Xbox controller " + (slot + 1), "xinput", levels[Math.Min((int)info.Level, 3)], true));
            }
        }
        catch (DllNotFoundException) { }
        catch (EntryPointNotFoundException) { }
    }

    static string Entry(string id, string name, string kind, int capacity, bool connected)
    {
        return "{\"id\":" + Quote(id) + ",\"name\":" + Quote(name) + ",\"kind\":" + Quote(kind) +
            ",\"capacity\":" + capacity + ",\"connected\":" + (connected ? "true" : "false") + "}";
    }

    static string Quote(string value)
    {
        var builder = new StringBuilder("\"");
        foreach (char character in value)
        {
            if (character == '"' || character == '\\') builder.Append('\\').Append(character);
            else if (character < 0x20) builder.Append("\\u").Append(((int)character).ToString("x4"));
            else builder.Append(character);
        }
        return builder.Append('"').ToString();
    }

    static bool Alive(int pid)
    {
        try { return !Process.GetProcessById(pid).HasExited; }
        catch { return false; }
    }

    static int Main(string[] args)
    {
        int every = 0, parent = 0;
        for (int index = 0; index + 1 < args.Length; index++)
        {
            if (args[index] == "--every") int.TryParse(args[index + 1], out every);
            if (args[index] == "--parent") int.TryParse(args[index + 1], out parent);
        }
        Console.OutputEncoding = new UTF8Encoding(false);
        while (true)
        {
            var found = new List<string>();
            try { Bluetooth(found); } catch (Exception) { }
            XInput(found);
            try
            {
                Console.Out.WriteLine("[" + string.Join(",", found.ToArray()) + "]");
                Console.Out.Flush();
            }
            catch (Exception) { return 0; }
            if (every <= 0) return 0;
            Thread.Sleep(every * 1000);
            if (parent != 0 && !Alive(parent)) return 0;
        }
    }
}
